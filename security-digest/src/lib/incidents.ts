// インシデント・ストーリー追跡: knit an evolving incident together across days.
// Deterministic and LLM-free — reuses the 続報クラスタ signal (shared CVE or ≥2
// distinctive title tokens) from cluster.ts, but links DATE-agnostically over a
// rolling window and only surfaces groups that span ≥2 distinct digest days.
// Computed on render (no new cron work, no schema).

import type { CveRef, CvssSeverity, DatedItem } from "./types";
import { linked, sigTokens } from "./cluster";
import { topSeverity } from "./cve";
import { articlesSinceWithDate } from "./db";
import { isoDate, jstToday } from "./weekly";

const WINDOW_DAYS = 7;
const MIN_DAYS = 2; // an incident must span ≥2 distinct digest dates

export type IncidentDay = {
  date: string; // "YYYY-MM-DD" (JST digest day)
  label: string; // deterministic escalation label
  items: DatedItem[];
};

export type Incident = {
  id: string; // stable: representative article id
  title: string;
  sources: string[];
  tags: string[];
  cves: CveRef[];
  topSeverity: CvssSeverity | null;
  firstDate: string;
  lastDate: string;
  dayCount: number;
  articleCount: number;
  days: IncidentDay[]; // chronological
};

// Start of the rolling window: WINDOW_DAYS before today (JST), as "YYYY-MM-DD".
function windowStart(): string {
  const d = jstToday();
  d.setUTCDate(d.getUTCDate() - WINDOW_DAYS);
  return isoDate(d);
}

// Escalation signals via substrings — language-agnostic enough for JP/EN feeds,
// and independent of the exact tag taxonomy.
const EXPLOIT_RE =
  /ransomware|ランサム|\bexploit|悪用|in the wild|actively exploited|active exploitation|\bpoc\b|proof[- ]of[- ]concept|weaponiz/i;
// `\bpatch` already covers patch/patches/patched/patching; no bare `patched`
// alternative (it would also match "dispatched").
const PATCH_RE =
  /\bpatch|パッチ|hotfix|修正プログラム|security update|セキュリティ更新|fixed in|アップデートを公開/i;

function dayLabel(items: DatedItem[], isFirst: boolean): string {
  if (isFirst) return "発見・初報";
  const blob = items
    .map((it) => `${it.title} ${it.excerpt} ${it.summaryJa ?? ""}`)
    .join(" ");
  if (EXPLOIT_RE.test(blob)) return "悪用・マルウェア確認";
  if (PATCH_RE.test(blob)) return "パッチ・修正情報";
  return "続報";
}

const SEV_RANK: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  NONE: 4,
};
function severityRank(s: CvssSeverity | null): number {
  return s ? SEV_RANK[s] ?? 5 : 5;
}

// Union the CVEs across a group, preferring the ref that actually carries a score.
function mergeCves(items: DatedItem[]): CveRef[] {
  const m = new Map<string, CveRef>();
  for (const it of items) {
    for (const c of it.cves ?? []) {
      const prev = m.get(c.id);
      if (!prev || (prev.score == null && c.score != null)) m.set(c.id, c);
    }
  }
  return Array.from(m.values());
}

export function buildIncidents(items: DatedItem[]): Incident[] {
  const n = items.length;
  if (n === 0) return [];
  const sigs = items.map(sigTokens);

  // union-find (date-agnostic linking; no cross-outlet gate — a single outlet's
  // multi-day coverage of one CVE IS a story we want to track).
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (linked(sigs[i], sigs[j])) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  }

  const incidents: Incident[] = [];
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    const group = idxs.map((i) => items[i]);
    const dates = new Set(group.map((it) => it.digestDate));
    if (dates.size < MIN_DAYS) continue; // must span ≥2 days to be a "story"

    const byDate = new Map<string, DatedItem[]>();
    for (const it of group) {
      const arr = byDate.get(it.digestDate);
      if (arr) arr.push(it);
      else byDate.set(it.digestDate, [it]);
    }
    const sortedDates = Array.from(byDate.keys()).sort(); // ascending
    const days: IncidentDay[] = sortedDates.map((date, di) => ({
      date,
      label: dayLabel(byDate.get(date)!, di === 0),
      items: byDate.get(date)!,
    }));

    const cves = mergeCves(group);
    const tags = Array.from(new Set(group.flatMap((it) => it.tags)));
    const sources = Array.from(new Set(group.map((it) => it.source)));

    // Representative: highest-severity article, tie-broken by earliest day.
    const rep = [...group].sort((a, b) => {
      const d =
        severityRank(topSeverity(a.cves ?? [])) -
        severityRank(topSeverity(b.cves ?? []));
      if (d !== 0) return d;
      return a.digestDate.localeCompare(b.digestDate);
    })[0];

    incidents.push({
      id: rep.id,
      title: rep.title,
      sources,
      tags,
      cves,
      topSeverity: topSeverity(cves),
      firstDate: sortedDates[0],
      lastDate: sortedDates[sortedDates.length - 1],
      dayCount: sortedDates.length,
      articleCount: group.length,
      days,
    });
  }

  // Newest activity first, then longer-running / more-covered stories.
  incidents.sort(
    (a, b) =>
      b.lastDate.localeCompare(a.lastDate) ||
      b.dayCount - a.dayCount ||
      b.articleCount - a.articleCount,
  );
  return incidents;
}

export async function getIncidents(): Promise<Incident[]> {
  const items = await articlesSinceWithDate(windowStart()).catch(() => []);
  return buildIncidents(items);
}
