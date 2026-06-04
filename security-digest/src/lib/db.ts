// Turso / libSQL persistence over the HTTP "pipeline" API. No SDK — just fetch,
// so we keep the zero-runtime-dependency invariant.
//
// Turso is SQLite-compatible and hosted, which is exactly what we need: real
// SQL you can query with the sqlite3 CLI semantics, AND durability on Vercel
// (a local .db file would be wiped on every serverless cold start).
//
// When TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are unset, everything degrades to
// an in-memory store so `npm run dev` works with no setup (history is then lost
// on process restart — same trade-off the KV version had).
//
// Endpoint reference: POST {httpUrl}/v2/pipeline
//   body: { requests: [ {type:"execute", stmt:{sql, args:[{type,value}]}}, ...,
//                        {type:"close"} ] }
//   resp: { results: [ {type:"ok", response:{type:"execute",
//            result:{cols:[{name}], rows:[[{type,value}]]}}}, ... ] }

import type { DigestItem, Digest, SourceKind } from "./types";

const URL_ENV = "TURSO_DATABASE_URL";
const TOKEN_ENV = "TURSO_AUTH_TOKEN";

export function dbEnabled(): boolean {
  return !!process.env[URL_ENV] && !!process.env[TOKEN_ENV];
}

// ---------------- low-level HTTP pipeline ----------------

type SqlValue = string | number | null;
type TursoArg =
  | { type: "null" }
  | { type: "integer"; value: string }
  | { type: "float"; value: number }
  | { type: "text"; value: string };

type TursoCell = { type: string; value?: string; base64?: string };
type Row = Record<string, SqlValue>;

function pipelineUrl(): string {
  let u = process.env[URL_ENV]!.trim();
  // Turso hands out libsql:// URLs; the HTTP API lives at the https:// host.
  if (u.startsWith("libsql://")) u = "https://" + u.slice("libsql://".length);
  return u.replace(/\/+$/, "") + "/v2/pipeline";
}

function toArg(v: SqlValue): TursoArg {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? { type: "integer", value: String(v) }
      : { type: "float", value: v };
  }
  return { type: "text", value: v };
}

function cellToJs(c: TursoCell): SqlValue {
  switch (c.type) {
    case "null":
      return null;
    case "integer":
      return c.value != null ? Number(c.value) : null;
    case "float":
      return c.value != null ? Number(c.value) : null;
    default:
      return c.value ?? null;
  }
}

type Stmt = { sql: string; args?: SqlValue[] };

async function pipeline(stmts: Stmt[]): Promise<Row[][]> {
  const executes = stmts.map((s) => ({
    type: "execute" as const,
    stmt: {
      sql: s.sql,
      args: (s.args ?? []).map(toArg),
    },
  }));

  const body = {
    requests: [...executes, { type: "close" as const }],
  };

  const res = await fetch(pipelineUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env[TOKEN_ENV]!}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Turso HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    results?: Array<
      | {
          type: "ok";
          response?: {
            type: string;
            result?: { cols?: { name?: string }[]; rows?: TursoCell[][] };
          };
        }
      | { type: "error"; error?: { message?: string } }
    >;
  };

  const out: Row[][] = [];
  for (const r of json.results ?? []) {
    if (r.type === "error") {
      throw new Error(`Turso SQL error: ${r.error?.message ?? "unknown"}`);
    }
    const result = r.response?.result;
    if (!result) {
      out.push([]);
      continue;
    }
    const cols = (result.cols ?? []).map((c) => c.name ?? "");
    const rows = (result.rows ?? []).map((cells) => {
      const obj: Row = {};
      cells.forEach((cell, i) => {
        obj[cols[i]] = cellToJs(cell);
      });
      return obj;
    });
    out.push(rows);
  }
  return out;
}

// ---------------- in-memory fallback ----------------

const memArticles = new Map<string, DigestItem>();
const memDigests = new Map<string, { generatedAt: string; payload: Digest }>();
const memBookmarks = new Map<string, string>(); // id -> created_at ISO

// ---------------- schema ----------------

let schemaReady = false;
// FTS5 may not be available on every libSQL build. If creating the virtual
// table fails, we set this false and fall back to LIKE-based search.
let ftsReady = false;

export function ftsAvailable(): boolean {
  return ftsReady;
}

async function ensureSchema(): Promise<void> {
  if (!dbEnabled() || schemaReady) return;
  await pipeline([
    {
      sql: `CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        link TEXT NOT NULL,
        excerpt TEXT,
        published_at TEXT,
        digest_date TEXT NOT NULL,
        tags TEXT,
        summary_ja TEXT,
        why_ja TEXT,
        body TEXT,
        body_ja TEXT,
        llm INTEGER NOT NULL DEFAULT 0,
        first_seen TEXT NOT NULL
      )`,
    },
    { sql: `CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(digest_date)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_articles_kind ON articles(kind)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at)` },
    {
      sql: `CREATE TABLE IF NOT EXISTS digests (
        date TEXT PRIMARY KEY,
        generated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      )`,
    },
  ]);

  // Full-text search index (separate pipeline so a missing FTS5 build can't
  // break the core tables). trigram tokenizer works for Japanese (no spaces).
  try {
    await pipeline([
      {
        sql: `CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
          id UNINDEXED, title, summary_ja, body_ja, tokenize='trigram'
        )`,
      },
    ]);
    ftsReady = true;
  } catch (err) {
    ftsReady = false;
    // eslint-disable-next-line no-console
    console.warn("[db] FTS5 unavailable; search falls back to LIKE:", err);
  }

  schemaReady = true;
}

// ---------------- row <-> DigestItem ----------------

function rowToItem(r: Row): DigestItem {
  return {
    id: String(r.id),
    source: String(r.source),
    kind: String(r.kind) as SourceKind,
    title: String(r.title),
    link: String(r.link),
    excerpt: r.excerpt == null ? "" : String(r.excerpt),
    publishedAt: r.published_at == null ? null : String(r.published_at),
    tags: r.tags ? safeArray(String(r.tags)) : [],
    summaryJa: r.summary_ja == null ? null : String(r.summary_ja),
    whyJa: r.why_ja == null ? null : String(r.why_ja),
    body: r.body == null ? null : String(r.body),
    bodyJa: r.body_ja == null ? null : String(r.body_ja),
    llm: Number(r.llm) === 1,
  };
}

function safeArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

// ---------------- public API ----------------

export async function saveDigest(d: Digest): Promise<void> {
  if (!dbEnabled()) {
    for (const it of d.items) {
      // Preserve previously-extracted body/bodyJa if the same article reappears.
      const prev = memArticles.get(it.id);
      memArticles.set(it.id, {
        ...it,
        body: it.body ?? prev?.body ?? null,
        bodyJa: it.bodyJa ?? prev?.bodyJa ?? null,
      });
    }
    memDigests.set(d.date, { generatedAt: d.generatedAt, payload: d });
    return;
  }

  await ensureSchema();

  const stmts: Stmt[] = [];
  for (const it of d.items) {
    // ON CONFLICT keeps body/body_ja/first_seen — those are owned by the lazy
    // detail-page flow, and re-ingesting the same article from the feed must
    // not wipe an already-extracted/translated body.
    stmts.push({
      sql: `INSERT INTO articles
        (id, source, kind, title, link, excerpt, published_at, digest_date,
         tags, summary_ja, why_ja, body, body_ja, llm, first_seen)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          source=excluded.source, kind=excluded.kind, title=excluded.title,
          link=excluded.link, excerpt=excluded.excerpt,
          published_at=excluded.published_at, digest_date=excluded.digest_date,
          tags=excluded.tags, summary_ja=excluded.summary_ja,
          why_ja=excluded.why_ja, llm=excluded.llm`,
      args: [
        it.id,
        it.source,
        it.kind,
        it.title,
        it.link,
        it.excerpt || null,
        it.publishedAt,
        d.date,
        JSON.stringify(it.tags),
        it.summaryJa,
        it.whyJa,
        it.body,
        it.bodyJa,
        it.llm ? 1 : 0,
        d.generatedAt,
      ],
    });
  }
  stmts.push({
    sql: `INSERT INTO digests (date, generated_at, payload) VALUES (?,?,?)
          ON CONFLICT(date) DO UPDATE SET
            generated_at=excluded.generated_at, payload=excluded.payload`,
    args: [d.date, d.generatedAt, JSON.stringify(d)],
  });

  // Keep the FTS index in sync (delete-then-insert per article). body_ja is
  // null on a fresh feed item and is filled later via patchArticleRow. A feed
  // routinely re-lists the same article for days, so we must NOT overwrite an
  // already-translated body_ja with "". The article upserts above ran first in
  // this same pipeline and preserve articles.body_ja (it's excluded from the
  // ON CONFLICT SET list), so we source the FTS body_ja from there.
  if (ftsReady) {
    for (const it of d.items) {
      stmts.push({ sql: `DELETE FROM articles_fts WHERE id = ?`, args: [it.id] });
      stmts.push({
        sql: `INSERT INTO articles_fts (id, title, summary_ja, body_ja)
              VALUES (?, ?, ?, COALESCE((SELECT body_ja FROM articles WHERE id = ?), ''))`,
        args: [it.id, it.title, it.summaryJa ?? "", it.id],
      });
    }
  }

  await pipeline(stmts);
}

export async function getArticleRow(id: string): Promise<DigestItem | null> {
  if (!dbEnabled()) return memArticles.get(id) ?? null;
  await ensureSchema();
  const [rows] = await pipeline([
    { sql: `SELECT * FROM articles WHERE id = ? LIMIT 1`, args: [id] },
  ]);
  return rows && rows.length ? rowToItem(rows[0]) : null;
}

export async function patchArticleRow(
  id: string,
  patch: Partial<Pick<DigestItem, "body" | "bodyJa">>,
): Promise<void> {
  if (!dbEnabled()) {
    const cur = memArticles.get(id);
    if (cur) memArticles.set(id, { ...cur, ...patch });
    return;
  }
  await ensureSchema();
  const sets: string[] = [];
  const args: SqlValue[] = [];
  if ("body" in patch) {
    sets.push("body = ?");
    args.push(patch.body ?? null);
  }
  if ("bodyJa" in patch) {
    sets.push("body_ja = ?");
    args.push(patch.bodyJa ?? null);
  }
  if (sets.length === 0) return;
  args.push(id);
  const stmts: Stmt[] = [
    { sql: `UPDATE articles SET ${sets.join(", ")} WHERE id = ?`, args },
  ];
  // When the Japanese body lands, mirror it into the FTS index so search can
  // match on translated full text too.
  if (ftsReady && "bodyJa" in patch) {
    stmts.push({
      sql: `UPDATE articles_fts SET body_ja = ? WHERE id = ?`,
      args: [patch.bodyJa ?? "", id],
    });
  }
  await pipeline(stmts);
}

export async function getDigestSnapshot(date: string): Promise<Digest | null> {
  if (!dbEnabled()) return memDigests.get(date)?.payload ?? null;
  await ensureSchema();
  const [rows] = await pipeline([
    { sql: `SELECT payload FROM digests WHERE date = ? LIMIT 1`, args: [date] },
  ]);
  if (!rows || !rows.length) return null;
  try {
    return JSON.parse(String(rows[0].payload)) as Digest;
  } catch {
    return null;
  }
}

export async function getLatestSnapshot(): Promise<Digest | null> {
  if (!dbEnabled()) {
    let best: { generatedAt: string; payload: Digest } | null = null;
    for (const v of memDigests.values()) {
      if (!best || v.generatedAt > best.generatedAt) best = v;
    }
    return best?.payload ?? null;
  }
  await ensureSchema();
  const [rows] = await pipeline([
    { sql: `SELECT payload FROM digests ORDER BY date DESC LIMIT 1` },
  ]);
  if (!rows || !rows.length) return null;
  try {
    return JSON.parse(String(rows[0].payload)) as Digest;
  } catch {
    return null;
  }
}

export async function listSnapshotDates(limit: number): Promise<string[]> {
  if (!dbEnabled()) {
    return Array.from(memDigests.keys()).sort((a, b) => (a < b ? 1 : -1)).slice(0, limit);
  }
  await ensureSchema();
  const [rows] = await pipeline([
    { sql: `SELECT date FROM digests ORDER BY date DESC LIMIT ?`, args: [limit] },
  ]);
  return (rows ?? []).map((r) => String(r.date));
}

// ---------------- search ----------------

function likeFallback(items: DigestItem[], q: string, limit: number): DigestItem[] {
  const needle = q.toLowerCase();
  const hits = items.filter((it) => {
    const hay = `${it.title} ${it.summaryJa ?? ""} ${it.bodyJa ?? ""} ${it.excerpt}`.toLowerCase();
    return hay.includes(needle);
  });
  hits.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });
  return hits.slice(0, limit);
}

export async function searchArticles(
  query: string,
  limit: number,
): Promise<DigestItem[]> {
  const q = query.trim();
  if (!q) return [];

  if (!dbEnabled()) {
    return likeFallback(Array.from(memArticles.values()), q, limit);
  }
  await ensureSchema();

  // trigram needs ≥3 chars; below that, MATCH errors — use LIKE instead.
  if (ftsReady && q.length >= 3) {
    // Wrap as a quoted string so FTS5 treats the whole input literally
    // (trigram then matches it as a substring). Double embedded quotes.
    const matchArg = `"${q.replace(/"/g, '""')}"`;
    const [rows] = await pipeline([
      {
        sql: `SELECT a.* FROM articles_fts f
              JOIN articles a ON a.id = f.id
              WHERE articles_fts MATCH ?
              ORDER BY rank
              LIMIT ?`,
        args: [matchArg, limit],
      },
    ]);
    return (rows ?? []).map(rowToItem);
  }

  // LIKE fallback (FTS unavailable, or query shorter than a trigram).
  const like = `%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
  const [rows] = await pipeline([
    {
      sql: `SELECT * FROM articles
            WHERE title LIKE ? ESCAPE '\\'
               OR summary_ja LIKE ? ESCAPE '\\'
               OR body_ja LIKE ? ESCAPE '\\'
               OR excerpt LIKE ? ESCAPE '\\'
            ORDER BY published_at DESC
            LIMIT ?`,
      args: [like, like, like, like, limit],
    },
  ]);
  return (rows ?? []).map(rowToItem);
}

// ---------------- bookmarks ----------------

export async function setBookmark(id: string, on: boolean): Promise<void> {
  const now = new Date().toISOString();
  if (!dbEnabled()) {
    if (on) memBookmarks.set(id, now);
    else memBookmarks.delete(id);
    return;
  }
  await ensureSchema();
  if (on) {
    await pipeline([
      {
        sql: `INSERT INTO bookmarks (id, created_at) VALUES (?, ?)
              ON CONFLICT(id) DO NOTHING`,
        args: [id, now],
      },
    ]);
  } else {
    await pipeline([{ sql: `DELETE FROM bookmarks WHERE id = ?`, args: [id] }]);
  }
}

export async function getBookmarkedIds(): Promise<Set<string>> {
  if (!dbEnabled()) return new Set(memBookmarks.keys());
  await ensureSchema();
  const [rows] = await pipeline([{ sql: `SELECT id FROM bookmarks` }]);
  return new Set((rows ?? []).map((r) => String(r.id)));
}

// Saved articles, most-recently-bookmarked first. Bookmarks whose article row
// no longer exists are skipped (left join would null them; we inner-join).
export async function listBookmarkedArticles(limit: number): Promise<DigestItem[]> {
  if (!dbEnabled()) {
    const ids = Array.from(memBookmarks.entries())
      .sort((a, b) => (a[1] < b[1] ? 1 : -1))
      .map(([id]) => id);
    const out: DigestItem[] = [];
    for (const id of ids) {
      const it = memArticles.get(id);
      if (it) out.push(it);
      if (out.length >= limit) break;
    }
    return out;
  }
  await ensureSchema();
  const [rows] = await pipeline([
    {
      sql: `SELECT a.* FROM bookmarks b
            JOIN articles a ON a.id = b.id
            ORDER BY b.created_at DESC
            LIMIT ?`,
      args: [limit],
    },
  ]);
  return (rows ?? []).map(rowToItem);
}
