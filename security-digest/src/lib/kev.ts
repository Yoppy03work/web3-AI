// CISA KEV — Known Exploited Vulnerabilities. CVEs CISA has confirmed are being
// actively exploited in the wild (old ones included — exactly "過去も含めて今
// 問題になっている脆弱性"). Free JSON, no key. Cached in-memory with a TTL since
// it updates roughly daily and the payload is ~2 MB.

const KEV_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const KEV_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;

export type KevEntry = {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string; // YYYY-MM-DD
  shortDescription: string;
  dueDate: string;
  knownRansomware: boolean;
};

export type KevData = {
  entries: KevEntry[]; // newest dateAdded first
  total: number;
  ransomwareCount: number;
  recent30: number;
  fetchedAt: number;
};

let cache: KevData | null = null;

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function getKev(): Promise<KevData> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < KEV_TTL_MS) return cache;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(KEV_URL, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`KEV HTTP ${res.status}`);
    const json = (await res.json()) as {
      vulnerabilities?: Array<Record<string, unknown>>;
    };
    const raw = json.vulnerabilities ?? [];
    const entries: KevEntry[] = raw
      .map((x) => ({
        cveID: String(x.cveID ?? ""),
        vendorProject: String(x.vendorProject ?? ""),
        product: String(x.product ?? ""),
        vulnerabilityName: String(x.vulnerabilityName ?? ""),
        dateAdded: String(x.dateAdded ?? ""),
        shortDescription: String(x.shortDescription ?? ""),
        dueDate: String(x.dueDate ?? ""),
        knownRansomware: String(x.knownRansomwareCampaignUse ?? "").toLowerCase() === "known",
      }))
      .filter((e) => /^CVE-\d{4}-\d+$/.test(e.cveID))
      .sort((a, b) => (a.dateAdded < b.dateAdded ? 1 : a.dateAdded > b.dateAdded ? -1 : 0));

    const cutoff = daysAgoIso(30);
    cache = {
      entries,
      total: entries.length,
      ransomwareCount: entries.filter((e) => e.knownRansomware).length,
      recent30: entries.filter((e) => e.dateAdded >= cutoff).length,
      fetchedAt: now,
    };
    return cache;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[kev] fetch failed:", err);
    if (cache) return cache; // serve stale on failure
    return { entries: [], total: 0, ransomwareCount: 0, recent30: 0, fetchedAt: now };
  } finally {
    clearTimeout(t);
  }
}
