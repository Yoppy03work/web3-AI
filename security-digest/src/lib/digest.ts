import { fetchAllFeeds } from "./rss";
import { SOURCES, TAGS, tagsFor } from "./sources";
import { llmEnabled, summarizeBatch } from "./summarize";
import type { Digest, DigestItem, RawItem } from "./types";

const DEFAULT_MAX_ITEMS = 12;
const DEFAULT_TTL_MINUTES = 360;

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// In-memory cache. Note: on serverless runtimes (Vercel), each cold-started
// lambda gets its own memory. The cache is best-effort — for cross-instance
// durability, swap this for Vercel KV / Upstash / Redis later.
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
  // Iterate TAGS definition order; include tags that actually appear.
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

  // Take the freshest N (already sorted newest-first by fetchAllFeeds).
  const top = tagged.slice(0, maxItems);

  const summaries = await summarizeBatch(top);

  const items: DigestItem[] = top.map((it, i) => {
    const s = summaries[i] ?? { summaryJa: it.excerpt || null, whyJa: null, llm: false };
    return {
      ...it,
      summaryJa: s.summaryJa,
      whyJa: s.whyJa,
      llm: s.llm,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    items,
    tags: appliedTagOrder(items),
    llmEnabled: llmEnabled(),
    failedSources,
  };
}

export async function getDigest(force = false): Promise<Digest> {
  const ttlMs = readInt("DIGEST_TTL_MINUTES", DEFAULT_TTL_MINUTES) * 60_000;
  const now = Date.now();

  if (!force && cache.data && cache.expiresAt > now) {
    return cache.data;
  }

  // Share an in-flight rebuild between concurrent callers.
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
