import { articleId } from "./id";
import { extractCveIds, fetchCvss } from "./cve";
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
} from "./db";
import { llmEnabled, summarizeBatch, summarizeTldr } from "./summarize";
import type { CveRef, Digest, DigestItem, Edition, RawItem } from "./types";

const DEFAULT_MAX_ITEMS = 12;
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

// Resolve CVSS for a per-item list of CVE IDs. Cache-first; only a bounded
// number of cache-misses are fetched from NVD this run (rate-limit friendly).
// Unfetched IDs are still returned (score/severity null) so the UI can at least
// show the CVE id+link; they get enriched on a later run.
async function enrichCves(idsByItem: string[][]): Promise<CveRef[][]> {
  const allIds = Array.from(new Set(idsByItem.flat()));
  if (allIds.length === 0) return idsByItem.map(() => []);

  const cache = await getCveCache(allIds).catch(() => new Map<string, CveRef>());

  const budget = readInt("NVD_MAX_LOOKUPS", DEFAULT_NVD_BUDGET);
  const misses = allIds.filter((id) => !cache.has(id));
  for (const id of misses.slice(0, budget)) {
    const ref = await fetchCvss(id);
    if (ref) {
      cache.set(id, ref);
      await putCveCache(ref).catch(() => {});
    } else {
      // network/rate-limit failure — stop hitting NVD this run, retry next time
      break;
    }
  }

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

  const summaries = await summarizeBatch(withIds);

  // Extract CVE IDs per item (title + excerpt), then enrich with CVSS from the
  // CVE cache + a small NVD budget. See enrichCves below.
  const cvesByItem = await enrichCves(
    withIds.map((it) => extractCveIds(`${it.title} ${it.excerpt}`)),
  );

  const items: DigestItem[] = withIds.map((it, i) => {
    const s = summaries[i] ?? { summaryJa: it.excerpt || null, whyJa: null, llm: false };
    return {
      ...it,
      summaryJa: s.summaryJa,
      whyJa: s.whyJa,
      llm: s.llm,
      body: null, // populated lazily by detail page
      bodyJa: null,
      cves: cvesByItem[i],
    };
  });

  const generatedAt = new Date().toISOString();

  // One extra LLM call to roll the run up into a 3-line TL;DR (null if no key).
  const tldr = await summarizeTldr(
    items.map((it) => ({
      title: it.title,
      source: it.source,
      summaryJa: it.summaryJa,
      excerpt: it.excerpt,
    })),
  ).catch(() => null);

  const digest: Digest = {
    generatedAt,
    items,
    tags: appliedTagOrder(items),
    llmEnabled: llmEnabled(),
    failedSources,
    date: jstDate(generatedAt),
    edition: jstEdition(generatedAt),
    tldr,
  };

  // Persist (best-effort; failures are logged but don't break the response).
  await saveDigest(digest).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[digest] persist failed:", err);
  });

  return digest;
}

export async function getDigest(force = false): Promise<Digest> {
  const ttlMs = readInt("DIGEST_TTL_MINUTES", DEFAULT_TTL_MINUTES) * 60_000;
  const now = Date.now();

  if (!force && cache.data && cache.expiresAt > now) {
    return cache.data;
  }

  // Cold instance with a recent snapshot in SQL: serve it instantly.
  if (!force && !cache.data && dbEnabled()) {
    const snap = await getLatestSnapshot().catch(() => null);
    if (snap) {
      cache.data = snap;
      cache.expiresAt = now + ttlMs;
      return snap;
    }
  }

  if (cache.inflight) return cache.inflight;

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

export async function listArchiveDates(): Promise<string[]> {
  const fromDb = await listSnapshotDates(MAX_ARCHIVE_DAYS).catch(() => []);
  if (fromDb.length) return fromDb;
  // Without SQL we only know "today" (the in-memory snapshot).
  return cache.data ? [cache.data.date] : [];
}

export async function getDigestByDate(date: string): Promise<Digest | null> {
  const fromDb = await getDigestSnapshot(date).catch(() => null);
  if (fromDb) return fromDb;
  if (cache.data && cache.data.date === date) return cache.data;
  return null;
}
