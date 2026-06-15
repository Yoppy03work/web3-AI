// キーワード購読アラート: when an article in a fresh digest matches one of the
// user's watched keywords (WATCH_KEYWORDS env, comma-separated), push a Slack
// alert. Dedup by article id (watch_seen) so the same article isn't re-alerted
// on later runs. Case-insensitive substring match over title + summary + excerpt.

import { markWatchSeen } from "./db";
import { notifyKeywordMatches } from "./notify";
import type { Digest, DigestItem } from "./types";

const NOTIFY_CAP = 15; // guard against a pathological burst

function watchKeywords(): string[] {
  return (process.env.WATCH_KEYWORDS ?? "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

export type KeywordMatch = { item: DigestItem; keywords: string[] };

export async function checkKeywordAlerts(
  digest: Digest,
): Promise<{ matched: number; notified: boolean }> {
  const keywords = watchKeywords();
  if (keywords.length === 0) return { matched: 0, notified: false };

  const matches: KeywordMatch[] = [];
  for (const it of digest.items) {
    const hay = `${it.title} ${it.summaryJa ?? ""} ${it.excerpt}`.toLowerCase();
    const hit = keywords.filter((k) => hay.includes(k));
    if (hit.length) matches.push({ item: it, keywords: hit });
  }
  if (matches.length === 0) return { matched: 0, notified: false };

  const newIds = await markWatchSeen(matches.map((m) => m.item.id)).catch((): string[] => []);
  const newSet = new Set(newIds);
  if (newIds.length === 0) return { matched: 0, notified: false };

  const fresh = matches.filter((m) => newSet.has(m.item.id));
  if (fresh.length > NOTIFY_CAP) {
    // eslint-disable-next-line no-console
    console.log(`[watch] ${fresh.length} matches (> cap); absorbed silently`);
    return { matched: 0, notified: false };
  }

  const notified = await notifyKeywordMatches(fresh).catch(() => false);
  // eslint-disable-next-line no-console
  console.log(`[watch] ${fresh.length} new keyword match(es); slack=${notified}`);
  return { matched: fresh.length, notified };
}
