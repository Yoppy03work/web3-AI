// Deterministic, zero-dep stats over the full CISA KEV catalog (kev.entries),
// computed at /cve render time (getKev is cached 6h in-memory). No cron work.
// Week bucketing reuses weekly.ts's UTC Monday logic so boundaries agree with
// the 週報; the 90-day window reuses kev.ts's daysAgoIso (lexicographic compare
// on zero-padded YYYY-MM-DD).

import type { KevEntry } from "./kev";
import { daysAgoIso } from "./kev";
import { isoDate, mondayOf } from "./weekly";

export type WeekBucket = { weekStart: string; total: number; ransomware: number };
export type VendorStat = { vendor: string; count: number };

// The last `weeks` ISO-week Mondays (UTC), oldest → newest.
function weekStartsBack(weeks: number): string[] {
  const anchor = new Date(`${mondayOf(isoDate(new Date()))}T00:00:00Z`);
  const out: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() - i * 7);
    out.push(isoDate(d));
  }
  return out;
}

// KEV additions per week for the last `weeks` weeks. Always returns exactly
// `weeks` buckets (zero-filled) so a sparkline renders a flat baseline rather
// than crashing when the catalog is empty or sparse.
export function computeWeeklyStats(entries: KevEntry[], weeks = 12): WeekBucket[] {
  const starts = weekStartsBack(weeks);
  const idx = new Map(starts.map((w, i) => [w, i]));
  const buckets: WeekBucket[] = starts.map((weekStart) => ({
    weekStart,
    total: 0,
    ransomware: 0,
  }));
  for (const e of entries) {
    if (!e.dateAdded) continue;
    const i = idx.get(mondayOf(e.dateAdded));
    if (i === undefined) continue; // outside the window
    buckets[i].total++;
    if (e.knownRansomware) buckets[i].ransomware++;
  }
  return buckets;
}

// Top vendors by KEV additions in the last `days` days. Empty → {vendors:[],max:0}.
export function computeVendorStats(
  entries: KevEntry[],
  days = 90,
  topN = 15,
): { vendors: VendorStat[]; max: number } {
  const cutoff = daysAgoIso(days);
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (!e.dateAdded || e.dateAdded < cutoff) continue;
    const v = e.vendorProject.trim() || "(不明)";
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const vendors = Array.from(counts.entries())
    .map(([vendor, count]) => ({ vendor, count }))
    .sort((a, b) => b.count - a.count || a.vendor.localeCompare(b.vendor))
    .slice(0, topN);
  return { vendors, max: vendors.length ? vendors[0].count : 0 };
}
