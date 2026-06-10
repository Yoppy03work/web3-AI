// 週報 orchestration. No extra cron slot (Vercel Hobby caps at 2), so this
// piggybacks on the existing evening cron: the route calls maybeGenerateWeekly
// on evening refreshes, and we only actually generate on Sundays (JST).
// Idempotent per ISO week (keyed by the JST Monday), so duplicate triggers
// within the same week are no-ops.

import { articlesSince, getWeeklyReport, saveWeeklyReport } from "./db";
import { topSeverity } from "./cve";
import { notifyWeekly } from "./notify";
import { summarizeWeekly } from "./summarize";

function jstToday(): Date {
  // A Date whose Y/M/D fields (in UTC) equal today's JST calendar date.
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${s}T00:00:00Z`);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function jstIsSunday(): boolean {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(new Date());
  return wd === "Sun";
}

// Monday (JST) of the week containing today. On Sunday this is 6 days back, so
// the Sunday-evening run covers Mon..Sun of the closing week.
export function currentWeekStart(): string {
  const today = jstToday();
  const dow = today.getUTCDay(); // 0=Sun..6=Sat
  const sinceMonday = (dow + 6) % 7;
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - sinceMonday);
  return isoDate(monday);
}

export function weekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${isoDate(start)} 〜 ${isoDate(end)}`;
}

export async function maybeGenerateWeekly(force = false): Promise<string | null> {
  if (!force && !jstIsSunday()) return null;

  const weekStart = currentWeekStart();
  const existing = await getWeeklyReport(weekStart).catch(() => null);
  if (existing) return existing; // already generated this week — idempotent

  const items = await articlesSince(weekStart).catch(() => []);
  if (items.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[weekly] no articles this week; skipping");
    return null;
  }

  const report = await summarizeWeekly(
    items.map((it) => ({
      title: it.title,
      source: it.source,
      kind: it.kind,
      tags: it.tags,
      whyJa: it.whyJa,
      summaryJa: it.summaryJa,
      topSeverity: topSeverity(it.cves ?? []),
    })),
    weekRangeLabel(weekStart),
  );
  if (!report) return null; // LLM off / failed — retry on next trigger

  await saveWeeklyReport(weekStart, report).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[weekly] persist failed:", err);
  });
  await notifyWeekly(report, weekRangeLabel(weekStart)).catch(() => {});
  // eslint-disable-next-line no-console
  console.log(`[weekly] generated for week ${weekStart} (${items.length} articles)`);
  return report;
}
