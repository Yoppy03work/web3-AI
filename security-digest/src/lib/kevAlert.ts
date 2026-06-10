// KEV速報: diff the CISA KEV catalog against what we've alerted on before, and
// push a Slack alert for newly added entries (= newly confirmed in-the-wild
// exploitation). Runs on every refresh (cron 2×/day); the diff makes it cheap.
//
// We only diff the newest WINDOW entries (catalog is sorted by dateAdded desc).
// Older entries never become "new", so marking the full ~1600-row catalog is
// unnecessary — windowing keeps each run to 1 SELECT + a small INSERT instead
// of a multi-second full seed (which once blew the serverless time budget).
//
// Flood guards: the first run seeds silently, and ANY run that discovers more
// than NOTIFY_CAP "new" ids (bulk import, partially-seeded state after a
// killed run) absorbs them silently instead of spamming Slack.

import { kevSeenCount, markKevSeen } from "./db";
import { enrichCveIds } from "./digest";
import { getKev } from "./kev";
import { notifyKevAlerts } from "./notify";

const WINDOW = 300; // ~10+ months of KEV additions
const NOTIFY_CAP = 50;

export async function checkKevAlerts(): Promise<{ newCount: number; notified: boolean }> {
  const kev = await getKev();
  if (kev.entries.length === 0) return { newCount: 0, notified: false };

  const window = kev.entries.slice(0, WINDOW);
  const seen = await kevSeenCount();
  const newIds = await markKevSeen(
    window.map((e) => ({ id: e.cveID, dateAdded: e.dateAdded })),
  );

  if (seen === 0) {
    // eslint-disable-next-line no-console
    console.log(`[kev] first run: seeded ${newIds.length} entries silently`);
    return { newCount: 0, notified: false };
  }
  if (newIds.length === 0) return { newCount: 0, notified: false };
  if (newIds.length > NOTIFY_CAP) {
    // eslint-disable-next-line no-console
    console.log(`[kev] absorbed ${newIds.length} entries silently (bulk/backfill)`);
    return { newCount: 0, notified: false };
  }

  const newSet = new Set(newIds);
  const fresh = window.filter((e) => newSet.has(e.cveID));

  // CVSS for the alert lines (cache-first; small NVD budget — unscored entries
  // just omit the score).
  const cvss = await enrichCveIds(newIds).catch(
    () => new Map<string, { score: number | null }>(),
  );

  const notified = await notifyKevAlerts(
    fresh.map((e) => ({
      cveID: e.cveID,
      vendorProject: e.vendorProject,
      product: e.product,
      vulnerabilityName: e.vulnerabilityName,
      knownRansomware: e.knownRansomware,
    })),
    cvss,
  ).catch(() => false);

  // eslint-disable-next-line no-console
  console.log(`[kev] ${fresh.length} new entr${fresh.length === 1 ? "y" : "ies"}; slack=${notified}`);
  return { newCount: fresh.length, notified };
}
