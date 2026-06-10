// KEV速報: diff the CISA KEV catalog against what we've alerted on before, and
// push a Slack alert for newly added entries (= newly confirmed in-the-wild
// exploitation). Runs on every refresh (cron 2×/day); the diff makes it cheap.
//
// First run: the catalog already holds ~1600 entries, so we seed them all as
// "seen" WITHOUT notifying — otherwise the first cron would flood Slack.

import { kevSeenCount, markKevSeen } from "./db";
import { enrichCveIds } from "./digest";
import { getKev } from "./kev";
import { notifyKevAlerts } from "./notify";

export async function checkKevAlerts(): Promise<{ newCount: number; notified: boolean }> {
  const kev = await getKev();
  if (kev.entries.length === 0) return { newCount: 0, notified: false };

  const seen = await kevSeenCount();
  const newIds = await markKevSeen(
    kev.entries.map((e) => ({ id: e.cveID, dateAdded: e.dateAdded })),
  );

  if (seen === 0) {
    // eslint-disable-next-line no-console
    console.log(`[kev] first run: seeded ${newIds.length} entries silently`);
    return { newCount: 0, notified: false };
  }
  if (newIds.length === 0) return { newCount: 0, notified: false };

  const newSet = new Set(newIds);
  const fresh = kev.entries.filter((e) => newSet.has(e.cveID));

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
