import { articleId } from "./id";
import { fetchAllFeeds } from "./rss";
import { SOURCES, TAGS, tagsFor } from "./sources";
import {
  kvGetJson,
  kvSetJson,
  storeEnabled,
  zaddDate,
  zrangeDatesDesc,
} from "./store";
import { llmEnabled, summarizeBatch } from "./summarize";
import type { Digest, DigestItem, RawItem } from "./types";

const DEFAULT_MAX_ITEMS = 12;
const DEFAULT_TTL_MINUTES = 360;
const MAX_ARCHIVE_DAYS = 90;

// KV key helpers
const KEY_LATEST = "digest:latest";
const KEY_DATES = "digest:dates"; // sorted set, score = epoch UTC midnight
const keyByDate = (d: string) => `digest:${d}`;
const keyArticle = (id: string) => `article:${id}`;

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

// In-memory layer in front of KV. Saves a Redis round-trip for hot pages.
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

async function buildDigest(): Promise<Digest> {
  const maxItems = readInt("DIGEST_MAX_ITEMS", DEFAULT_MAX_ITEMS);

  const { items: raw, failedSources } = await fetchAllFeeds(SOURCES);

  const tagged: Array<RawItem & { tags: string[] }> = raw.map((it) => ({
    ...it,
    tags: tagsFor(`${it.title} ${it.excerpt}`),
  }));

  const top = tagged.slice(0, maxItems);

  // Assign stable IDs (SHA-256 of canonical link, first 10 hex).
  const withIds = await Promise.all(
    top.map(async (it) => ({ ...it, id: await articleId(it.link) })),
  );

  const summaries = await summarizeBatch(withIds);

  const items: DigestItem[] = withIds.map((it, i) => {
    const s = summaries[i] ?? { summaryJa: it.excerpt || null, whyJa: null, llm: false };
    return {
      ...it,
      summaryJa: s.summaryJa,
      whyJa: s.whyJa,
      llm: s.llm,
      body: null, // populated lazily by detail page
      bodyJa: null,
    };
  });

  const generatedAt = new Date().toISOString();
  const digest: Digest = {
    generatedAt,
    items,
    tags: appliedTagOrder(items),
    llmEnabled: llmEnabled(),
    failedSources,
    date: jstDate(generatedAt),
  };

  // Persist (best-effort; failures are logged but don't break the response).
  await persistDigest(digest).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[digest] persist failed:", err);
  });

  return digest;
}

async function persistDigest(d: Digest): Promise<void> {
  if (!storeEnabled()) return;
  await Promise.all([
    kvSetJson(KEY_LATEST, d),
    kvSetJson(keyByDate(d.date), d),
    zaddDate(KEY_DATES, d.date),
    // Per-article record so the detail page can read without scanning a digest.
    ...d.items.map((it) => kvSetJson(keyArticle(it.id), it)),
  ]);
}

export async function getDigest(force = false): Promise<Digest> {
  const ttlMs = readInt("DIGEST_TTL_MINUTES", DEFAULT_TTL_MINUTES) * 60_000;
  const now = Date.now();

  if (!force && cache.data && cache.expiresAt > now) {
    return cache.data;
  }

  // If we don't have anything in memory but KV holds a recent snapshot, use it.
  // This makes cold-started instances feel "instant" for the visitor.
  if (!force && !cache.data && storeEnabled()) {
    const fromKv = await kvGetJson<Digest>(KEY_LATEST).catch(() => null);
    if (fromKv) {
      cache.data = fromKv;
      cache.expiresAt = now + ttlMs;
      return fromKv;
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
  if (storeEnabled()) {
    const fromKv = await kvGetJson<DigestItem>(keyArticle(id)).catch(() => null);
    if (fromKv) return fromKv;
  }
  // Fall back to the in-memory latest digest (useful for dev without KV).
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
  if (!storeEnabled()) return;
  const cur = await kvGetJson<DigestItem>(keyArticle(id));
  if (!cur) return;
  Object.assign(cur, patch);
  await kvSetJson(keyArticle(id), cur);
}

export async function listArchiveDates(): Promise<string[]> {
  if (!storeEnabled()) {
    // Without KV we only know "today" (the in-memory snapshot).
    return cache.data ? [cache.data.date] : [];
  }
  return zrangeDatesDesc(KEY_DATES, MAX_ARCHIVE_DAYS).catch(() => []);
}

export async function getDigestByDate(date: string): Promise<Digest | null> {
  if (!storeEnabled()) {
    if (cache.data && cache.data.date === date) return cache.data;
    return null;
  }
  return kvGetJson<Digest>(keyByDate(date)).catch(() => null);
}
