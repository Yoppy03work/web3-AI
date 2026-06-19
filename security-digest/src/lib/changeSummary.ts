// 変化サマリ: "what changed since the previous edition." Deterministic,
// render-time only (no cron work, no LLM, no schema). Compares the current
// digest snapshot against the previous DISTINCT snapshot.
//
// NOTE: we intentionally do NOT flag "silent source failures" (a source that
// had items last edition and zero now). digest.items is the diversified top-18
// (PER_SOURCE_CAP), so a source can fetch fine yet contribute 0 items when
// crowded out — that rule would false-positive almost every edition. Hard fetch
// failures are already surfaced via digest.failedSources on the home banner.

import type { Digest, DigestItem } from "./types";
import { getDigestSnapshot, listSnapshotDates, snapshotKey } from "./db";

export type SourceDelta = { source: string; prev: number; now: number };

export type ChangeSummary = {
  hasPrev: boolean;
  prevKey: string | null;
  newCount: number; // current articles whose id wasn't in the previous edition
  sourceDeltas: SourceDelta[]; // only sources whose count changed, biggest swing first
};

function countBySource(items: DigestItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(it.source, (m.get(it.source) ?? 0) + 1);
  return m;
}

export function compareSnapshots(
  current: Digest,
  previous: Digest | null,
): ChangeSummary {
  if (!previous) {
    return {
      hasPrev: false,
      prevKey: null,
      newCount: current.items.length,
      sourceDeltas: [],
    };
  }

  const prevIds = new Set(previous.items.map((it) => it.id));
  const newCount = current.items.filter((it) => !prevIds.has(it.id)).length;

  const curBy = countBySource(current.items);
  const prevBy = countBySource(previous.items);
  const sources = new Set([...curBy.keys(), ...prevBy.keys()]);
  const sourceDeltas = Array.from(sources)
    .map((source) => ({
      source,
      prev: prevBy.get(source) ?? 0,
      now: curBy.get(source) ?? 0,
    }))
    .filter((d) => d.prev !== d.now)
    .sort(
      (a, b) =>
        Math.abs(b.now - b.prev) - Math.abs(a.now - a.prev) ||
        a.source.localeCompare(b.source),
    );

  return { hasPrev: true, prevKey: null, newCount, sourceDeltas };
}

// Per-instance memo keyed by the current snapshot key, so concurrent renders in
// the same instance don't each re-read the previous snapshot from Turso.
const memo = new Map<string, ChangeSummary>();

export async function getChangesSinceLastEdition(
  digest: Digest,
): Promise<ChangeSummary> {
  const selfKey = snapshotKey(digest);
  const cached = memo.get(selfKey);
  if (cached) return cached;

  // Newest few keys; pick the first that isn't THIS digest (a newer refresh may
  // have landed mid-render, so [0] isn't reliably "previous").
  const keys = await listSnapshotDates(4).catch((): string[] => []);
  const prevKey = keys.find((k) => k !== selfKey) ?? null;
  const previous = prevKey
    ? await getDigestSnapshot(prevKey).catch(() => null)
    : null;

  const summary = compareSnapshots(digest, previous);
  summary.prevKey = prevKey;
  if (memo.size > 8) memo.clear(); // bound it; only ~2 keys/day matter
  memo.set(selfKey, summary);
  return summary;
}
