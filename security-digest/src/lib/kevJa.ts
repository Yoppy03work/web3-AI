// Japanese translations for KEV entries, cache-first. KEV text is immutable
// per CVE, so each entry is translated exactly once (LLM) and stored in the
// kev_ja table; afterwards every page view / Slack alert reads the cache.

import { getKevJa, putKevJa, type KevJa } from "./db";
import { getKev, type KevEntry } from "./kev";
import { translateKevBatch } from "./summarize";

// Resolve translations for the given entries. Cache-first; at most `budget`
// uncached entries are translated this call (bounds latency + LLM cost — the
// rest fill in on later calls). Returns whatever is known by the end.
export async function ensureKevJa(
  entries: KevEntry[],
  budget: number,
): Promise<Map<string, KevJa>> {
  if (entries.length === 0) return new Map();

  const ids = entries.map((e) => e.cveID);
  // A cache-READ failure must not be treated as "everything is missing": with
  // Turso down we'd re-translate (and fail to persist) on every view —
  // unbounded LLM spend. Skip translating entirely and let callers fall back
  // to English until the cache is reachable again.
  let cached: Map<string, KevJa>;
  try {
    cached = await getKevJa(ids);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[kev-ja] cache unreachable; skipping translation:", err);
    return new Map();
  }

  const missing = entries.filter((e) => !cached.has(e.cveID)).slice(0, budget);
  if (missing.length === 0) return cached;

  const translated = await translateKevBatch(
    missing.map((e) => ({
      id: e.cveID,
      name: e.vulnerabilityName,
      desc: e.shortDescription,
    })),
  );
  if (translated.size > 0) {
    const rows = Array.from(translated.entries()).map(([id, t]) => ({
      id,
      nameJa: t.nameJa,
      descJa: t.descJa,
    }));
    await putKevJa(rows).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[kev-ja] persist failed:", err);
    });
    for (const [id, t] of translated) cached.set(id, t);
  }
  return cached;
}

// Pre-warm the cache for the /cve page's visible window (page shows 50; keep
// in sync with SHOW in app/cve/page.tsx). Called from the cron refresh's
// after() block so page views are served entirely from cache. ensureKevJa is
// cache-first, so this is a no-op once warm.
const PREWARM_WINDOW = 50;

export async function prewarmKevJa(): Promise<void> {
  const kev = await getKev();
  await ensureKevJa(kev.entries.slice(0, PREWARM_WINDOW), PREWARM_WINDOW);
}
