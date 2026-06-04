import type { CveRef, CvssSeverity } from "./types";

// Extract + enrich CVE identifiers. CVSS comes from the NVD CVE API 2.0:
//   GET https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-YYYY-NNNN
// No key needed (5 req / 30s); set NVD_API_KEY for 50 req / 30s.
//
// We never block the whole digest on NVD: a small per-run budget is fetched and
// the rest fill in on later runs (results are cached in SQL by the caller).

const NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const NVD_TIMEOUT_MS = 8000;
// CVE-YYYY-NNNN (4–7 digit sequence). Bounded year to avoid matching random text.
const CVE_RE = /CVE-(?:19|20)\d{2}-\d{4,7}/gi;

export function extractCveIds(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(CVE_RE)) {
    out.add(m[0].toUpperCase());
  }
  return Array.from(out);
}

function normSeverity(s: unknown): CvssSeverity | null {
  if (typeof s !== "string") return null;
  const up = s.toUpperCase();
  if (up === "CRITICAL" || up === "HIGH" || up === "MEDIUM" || up === "LOW" || up === "NONE") {
    return up;
  }
  return null;
}

// Severity bucket from a numeric base score (CVSS v3 bands), used when NVD
// gives a score but no textual severity (some v2 entries).
function severityFromScore(score: number): CvssSeverity {
  if (score >= 9.0) return "CRITICAL";
  if (score >= 7.0) return "HIGH";
  if (score >= 4.0) return "MEDIUM";
  if (score > 0.0) return "LOW";
  return "NONE";
}

type NvdMetric = {
  cvssData?: { baseScore?: number; baseSeverity?: string; vectorString?: string };
  baseSeverity?: string;
};

type Metric = { score: number | null; severity: CvssSeverity | null; vector: string | null };

function pickMetric(metrics: Record<string, NvdMetric[]> | undefined): Metric {
  const empty: Metric = { score: null, severity: null, vector: null };
  if (!metrics) return empty;
  // Preference: v4.0 > v3.1 > v3.0 > v2.
  const order = ["cvssMetricV40", "cvssMetricV31", "cvssMetricV30", "cvssMetricV2"];
  for (const key of order) {
    const arr = metrics[key];
    if (Array.isArray(arr) && arr.length > 0) {
      const m = arr[0];
      const score = typeof m.cvssData?.baseScore === "number" ? m.cvssData.baseScore : null;
      const severity =
        normSeverity(m.cvssData?.baseSeverity) ??
        normSeverity(m.baseSeverity) ??
        (score != null ? severityFromScore(score) : null);
      return { score, severity, vector: m.cvssData?.vectorString ?? null };
    }
  }
  return empty;
}

// Fetch one CVE from NVD. Returns the enriched ref, or null on network/HTTP
// failure (so the caller can retry on a later run). A CVE that NVD knows but
// has no score yet returns score/severity = null (still "found").
export async function fetchCvss(cveId: string): Promise<CveRef | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), NVD_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    const key = process.env.NVD_API_KEY?.trim();
    if (key) headers["apiKey"] = key;

    const res = await fetch(`${NVD_URL}?cveId=${encodeURIComponent(cveId)}`, {
      signal: ctrl.signal,
      cache: "no-store",
      headers,
    });
    if (!res.ok) return null; // includes 403/429 rate-limit → retry next run
    const json = (await res.json()) as {
      vulnerabilities?: Array<{ cve?: { id?: string; metrics?: Record<string, NvdMetric[]> } }>;
    };
    const cve = json.vulnerabilities?.[0]?.cve;
    if (!cve) {
      // NVD returned 200 but no record — treat as "found, no data" so we don't
      // hammer it forever for a typo'd id.
      return { id: cveId, score: null, severity: null, vector: null };
    }
    const m = pickMetric(cve.metrics);
    return { id: cveId, score: m.score, severity: m.severity, vector: m.vector };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const NVD_SEVERITY_ORDER: CvssSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"];

// Highest-severity CVE in a list (for sorting / headline display).
export function topSeverity(cves: CveRef[]): CvssSeverity | null {
  let best: CvssSeverity | null = null;
  for (const c of cves) {
    if (!c.severity) continue;
    if (best === null || NVD_SEVERITY_ORDER.indexOf(c.severity) < NVD_SEVERITY_ORDER.indexOf(best)) {
      best = c.severity;
    }
  }
  return best;
}
