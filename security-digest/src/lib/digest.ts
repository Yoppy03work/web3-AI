import { articleId } from "./id";
import { computeClusters } from "./cluster";
import { extractCveIds, fetchCvss, topSeverity } from "./cve";
import { diversify, fetchAllFeeds } from "./rss";
import { SOURCES, TAGS, tagsFor } from "./sources";
import {
  dbEnabled,
  getArticleRow,
  getCveCache,
  getDigestSnapshot,
  getLatestSnapshot,
  listSnapshotDates,
  patchArticleRow,
  putCveCache,
  saveDigest,
  snapshotKey,
} from "./db";
import { llmEnabled, summarizeBatch, summarizeReport, summarizeTldr } from "./summarize";
import type { CveRef, Digest, DigestItem, Edition, RawItem } from "./types";

const DEFAULT_MAX_ITEMS = 18;
const DEFAULT_TTL_MINUTES = 360;
const MAX_ARCHIVE_DAYS = 90;
// Cap per source in the displayed/summarized top-N so a high-volume feed
// (arXiv announces ~80/day) can't crowd out everything else.
const PER_SOURCE_CAP = 4;
// Per-run NVD fetch budget. NVD allows ~5 req/30s without a key, so we only
// enrich a few *new* CVEs per build; the rest are served from cache and fresh
// ones fill in over subsequent runs. Tunable via NVD_MAX_LOOKUPS.
const DEFAULT_NVD_BUDGET = 5;

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// JST date string from an ISO timestamp (YYYY-MM-DD).
function jstDate(iso: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(iso));
}

// Which edition a given moment belongs to. The crons fire at 07:00 and 19:00
// JST; we split the day at 15:00 JST so a 07:00 run is "morning" and a 19:00
// run is "evening" (manual refreshes get the nearest label).
function jstEdition(iso: string): Edition {
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  const hour = parseInt(hourStr, 10);
  return hour >= 4 && hour < 15 ? "morning" : "evening";
}

// In-memory layer in front of SQL. Saves a round-trip for hot pages.
// Note: serverless functions cold-start; this is best-effort within an instance.
type CacheState = {
  data: Digest | null;
  expiresAt: number;
  inflight: Promise<Digest> | null;
};

const cache: CacheState = {
  data: null,
  expiresAt: 0,
  inflight: null,
};

function appliedTagOrder(items: DigestItem[]): string[] {
  const seen = new Set<string>();
  for (const tag of Object.keys(TAGS)) {
    if (items.some((it) => it.tags.includes(tag))) seen.add(tag);
  }
  return Array.from(seen);
}

function maxCvssScore(it: DigestItem): number {
  let best = -1;
  for (const c of it.cves ?? []) {
    if (typeof c.score === "number" && c.score > best) best = c.score;
  }
  return best;
}

// 0 = CRITICAL, 1 = HIGH, 2 = everything else. Only CRITICAL/HIGH get boosted;
// MEDIUM/LOW/none stay together so minor CVEs don't outrank breaking news.
function severityTier(it: DigestItem): number {
  const s = topSeverity(it.cves ?? []);
  if (s === "CRITICAL") return 0;
  if (s === "HIGH") return 1;
  return 2;
}

function sortBySeverity(items: DigestItem[]): void {
  const ts = (it: DigestItem) => (it.publishedAt ? Date.parse(it.publishedAt) : 0);
  items.sort((a, b) => {
    const ta = severityTier(a);
    const tb = severityTier(b);
    if (ta !== tb) return ta - tb;
    if (ta < 2) {
      const d = maxCvssScore(b) - maxCvssScore(a);
      if (d !== 0) return d;
    }
    return ts(b) - ts(a); // recency
  });
}

// Resolve CVSS for a set of CVE IDs. Cache-first; only a bounded number of
// cache-misses are fetched from NVD per call (rate-limit friendly). Returns a
// map id→ref (unfetched ids absent; callers default to null score).
export async function enrichCveIds(ids: string[]): Promise<Map<string, CveRef>> {
  const allIds = Array.from(new Set(ids));
  const cache =
    allIds.length === 0
      ? new Map<string, CveRef>()
      : await getCveCache(allIds).catch(() => new Map<string, CveRef>());

  const budget = readInt("NVD_MAX_LOOKUPS", DEFAULT_NVD_BUDGET);
  const misses = allIds.filter((id) => !cache.has(id));
  for (const id of misses.slice(0, budget)) {
    const ref = await fetchCvss(id);
    if (ref) {
      cache.set(id, ref);
      await putCveCache(ref).catch(() => {});
    } else {
      break; // network/rate-limit failure — retry next time
    }
  }
  return cache;
}

async function enrichCves(idsByItem: string[][]): Promise<CveRef[][]> {
  const cache = await enrichCveIds(idsByItem.flat());
  return idsByItem.map((ids) =>
    ids.map((id) => cache.get(id) ?? { id, score: null, severity: null, vector: null }),
  );
}

async function buildDigest(): Promise<Digest> {
  const maxItems = readInt("DIGEST_MAX_ITEMS", DEFAULT_MAX_ITEMS);

  const { items: raw, failedSources } = await fetchAllFeeds(SOURCES);

  // Keep the front page varied: cap per source before taking the top N.
  const top: RawItem[] = diversify(raw, maxItems, PER_SOURCE_CAP);

  const tagged = top.map((it) => ({
    ...it,
    tags: tagsFor(`${it.title} ${it.excerpt}`),
  }));

  // Assign stable IDs (SHA-256 of canonical link, first 10 hex).
  const withIds = await Promise.all(
    tagged.map(async (it) => ({ ...it, id: await articleId(it.link) })),
  );

  // Native-Japanese sources (lang:"ja") skip the LLM entirely — their RSS
  // excerpt is already a Japanese summary. Only English items go to the batch.
  const enItems = withIds.filter((it) => it.lang !== "ja");
  const enSummaries = await summarizeBatch(enItems);
  const byId = new Map(enItems.map((it, i) => [it.id, enSummaries[i]]));

  // Extract CVE IDs per item (title + excerpt), then enrich with CVSS from the
  // CVE cache + a small NVD budget. See enrichCves below.
  const cvesByItem = await enrichCves(
    withIds.map((it) => extractCveIds(`${it.title} ${it.excerpt}`)),
  );

  const items: DigestItem[] = withIds.map((it, i) => {
    const s =
      it.lang === "ja"
        ? { summaryJa: it.excerpt || null, whyJa: null, llm: false }
        : byId.get(it.id) ?? { summaryJa: it.excerpt || null, whyJa: null, llm: false };
    return {
      ...it,
      summaryJa: s.summaryJa,
      whyJa: s.whyJa,
      llm: s.llm,
      body: null, // populated lazily by detail page
      bodyJa: null,
      cves: cvesByItem[i],
      related: [],
    };
  });

  // 続報クラスタ: link same-incident articles across outlets.
  const clusters = computeClusters(items);
  for (const it of items) it.related = clusters.get(it.id) ?? [];

  // Severity-aware ordering: float CRITICAL then HIGH CVE items to the top
  // (by CVSS score), keep everything else in its existing recency order.
  // This surfaces serious vulns without burying general news under minor CVEs.
  sortBySeverity(items);

  const generatedAt = new Date().toISOString();

  // Two LLM roll-ups in parallel: the 3-line TL;DR and the fuller 今日のレポート
  // (both null when no key).
  const [tldr, report] = await Promise.all([
    summarizeTldr(
      items.map((it) => ({
        title: it.title,
        source: it.source,
        summaryJa: it.summaryJa,
        excerpt: it.excerpt,
      })),
    ).catch(() => null),
    summarizeReport(
      items.map((it) => ({
        title: it.title,
        source: it.source,
        kind: it.kind,
        summaryJa: it.summaryJa,
        excerpt: it.excerpt,
        topSeverity: topSeverity(it.cves ?? []),
      })),
    ).catch(() => null),
  ]);

  const digest: Digest = {
    generatedAt,
    items,
    tags: appliedTagOrder(items),
    llmEnabled: llmEnabled(),
    failedSources,
    date: jstDate(generatedAt),
    edition: jstEdition(generatedAt),
    tldr,
    report,
  };

  // Persist (best-effort; failures are logged but don't break the response).
  await saveDigest(digest).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[digest] persist failed:", err);
  });

  return digest;
}

// When Turso is connected it is the source of truth, and the in-memory layer is
// only a short burst cache. This matters because each Next route (page vs API
// route) and each serverless instance has its OWN module memory: after a refresh
// updates Turso, other modules must re-read it quickly or they'd serve a stale
// digest (e.g. page shows 12 while the API already has 18). 90s keeps them in
// sync without hammering Turso. Without Turso, the in-memory cache uses the long
// TTL so we don't rebuild (feeds + LLM) every 90s in dev.
const MEM_CACHE_MS = 90_000;

function rebuild(): Promise<Digest> {
  if (cache.inflight) return cache.inflight;
  const ttlMs = dbEnabled()
    ? MEM_CACHE_MS
    : readInt("DIGEST_TTL_MINUTES", DEFAULT_TTL_MINUTES) * 60_000;
  cache.inflight = (async () => {
    try {
      const built = await buildDigest();
      cache.data = built;
      cache.expiresAt = Date.now() + ttlMs;
      return built;
    } finally {
      cache.inflight = null;
    }
  })();
  return cache.inflight;
}

export async function getDigest(force = false): Promise<Digest> {
  if (force) return rebuild();

  const now = Date.now();
  if (cache.data && cache.expiresAt > now) return cache.data;

  if (dbEnabled()) {
    // Re-read the latest snapshot so every route/instance converges fast.
    const snap = await getLatestSnapshot().catch(() => null);
    if (snap) {
      cache.data = snap;
      cache.expiresAt = now + MEM_CACHE_MS;
      return snap;
    }
    // Turso reachable but empty (first ever run) → build. On a transient Turso
    // miss with a stale copy in hand, serve the stale copy instead of rebuilding.
    if (cache.data) {
      cache.expiresAt = now + MEM_CACHE_MS;
      return cache.data;
    }
  }

  return rebuild();
}

// ---------------- archive / detail loaders ----------------

export async function getArticle(id: string): Promise<DigestItem | null> {
  const fromDb = await getArticleRow(id).catch(() => null);
  if (fromDb) return fromDb;

  // Fall back to the in-memory latest digest (useful for dev without SQL).
  if (cache.data) {
    const hit = cache.data.items.find((it) => it.id === id);
    if (hit) return hit;
  }

  // Last resort: rebuild so a deep-link doesn't 404 on a cold instance.
  const fresh = await getDigest();
  return fresh.items.find((it) => it.id === id) ?? null;
}

export async function patchArticle(
  id: string,
  patch: Partial<Pick<DigestItem, "body" | "bodyJa">>,
): Promise<void> {
  // Update in-memory cache so subsequent reads in the same instance see it.
  if (cache.data) {
    const it = cache.data.items.find((x) => x.id === id);
    if (it) Object.assign(it, patch);
  }
  await patchArticleRow(id, patch);
}

// Returns snapshot KEYS ("YYYY-MM-DD#edition"), newest first.
export async function listArchiveKeys(): Promise<string[]> {
  const fromDb = await listSnapshotDates(MAX_ARCHIVE_DAYS).catch(() => []);
  if (fromDb.length) return fromDb;
  // Without SQL we only know "today" (the in-memory snapshot).
  return cache.data ? [snapshotKey(cache.data)] : [];
}

export async function getDigestByKey(key: string): Promise<Digest | null> {
  const fromDb = await getDigestSnapshot(key).catch(() => null);
  if (fromDb) return fromDb;
  if (cache.data && snapshotKey(cache.data) === key) return cache.data;
  return null;
}
