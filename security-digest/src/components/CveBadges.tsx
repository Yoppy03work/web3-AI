import type { CveRef } from "@/lib/types";

// Plain presentational component (no client hooks) so it works inside both
// server pages and the "use client" FeedClient.

const SEV_CLASS: Record<string, string> = {
  CRITICAL: "sev-crit",
  HIGH: "sev-high",
  MEDIUM: "sev-med",
  LOW: "sev-low",
  NONE: "sev-none",
};
const SEV_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"];

export default function CveBadges({
  cves,
  max,
}: {
  cves: CveRef[] | undefined;
  max?: number;
}) {
  if (!cves || cves.length === 0) return null;

  const sorted = [...cves].sort((a, b) => {
    const sa = a.severity ? SEV_ORDER.indexOf(a.severity) : 99;
    const sb = b.severity ? SEV_ORDER.indexOf(b.severity) : 99;
    if (sa !== sb) return sa - sb;
    return (b.score ?? -1) - (a.score ?? -1);
  });
  const shown = max ? sorted.slice(0, max) : sorted;
  const extra = sorted.length - shown.length;

  return (
    <div className="cves">
      {shown.map((c) => {
        const cls = c.severity ? SEV_CLASS[c.severity] : "sev-unknown";
        const label = c.score != null ? `${c.id} · ${c.score.toFixed(1)}` : c.id;
        const title = c.severity
          ? `${c.severity}${c.vector ? " · " + c.vector : ""}`
          : "CVSS 未取得（NVD 反映待ち）";
        return (
          <a
            key={c.id}
            className={`cve ${cls}`}
            href={`https://nvd.nist.gov/vuln/detail/${c.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title={title}
          >
            {label}
          </a>
        );
      })}
      {extra > 0 ? <span className="cve-more">+{extra}</span> : null}
    </div>
  );
}
