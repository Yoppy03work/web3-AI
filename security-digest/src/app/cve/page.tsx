import Link from "next/link";
import { getKev } from "@/lib/kev";
import { enrichCveIds } from "@/lib/digest";
import { articlesMentioningCves } from "@/lib/db";
import type { CveRef, RelatedRef } from "@/lib/types";

export const dynamic = "force-dynamic";

const SHOW = 50;

function jpDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || "—";
  const dt = new Date(`${d}T00:00:00+09:00`);
  if (isNaN(dt.getTime())) return d;
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "short", day: "numeric" }).format(dt);
}

function sevClass(cve: CveRef | undefined): string {
  const s = cve?.severity;
  if (s === "CRITICAL") return "sev-crit";
  if (s === "HIGH") return "sev-high";
  if (s === "MEDIUM") return "sev-med";
  if (s === "LOW") return "sev-low";
  return "sev-unknown";
}

export default async function CvePage() {
  const kev = await getKev();
  const shown = kev.entries.slice(0, SHOW);
  const ids = shown.map((e) => e.cveID);

  // CVSS (cache-first, small NVD budget) + our own coverage cross-reference.
  const [cvss, coverage] = await Promise.all([
    enrichCveIds(ids).catch(() => new Map<string, CveRef>()),
    articlesMentioningCves(ids).catch(() => new Map<string, RelatedRef[]>()),
  ]);

  return (
    <main className="shell">
      <nav className="topnav">
        <Link href="/" className="back">← フィードに戻る</Link>
        <Link href="/search" className="back">🔎 検索</Link>
        <Link href="/archive" className="back">アーカイブ</Link>
      </nav>

      <header className="hdr">
        <h1 className="title">
          <span className="prompt">$</span> kev — 悪用中の脆弱性
        </h1>
        <p className="dim" style={{ marginTop: "6px" }}>
          CISA KEV（Known Exploited Vulnerabilities）= 実際に攻撃で悪用が確認された脆弱性。
          古い CVE でも今なお使われているものを CISA が随時追加。
        </p>
        <div className="banners">
          <span className="pill">登録 {kev.total} 件</span>
          <span className="pill ok">直近30日 +{kev.recent30}</span>
          <span className="pill err">🦠 ランサム悪用 {kev.ransomwareCount}</span>
        </div>
      </header>

      {shown.length === 0 ? (
        <p className="empty">KEV を取得できませんでした。時間をおいて再読み込みしてください。</p>
      ) : (
        <ul className="kev-list">
          {shown.map((e) => {
            const ref = cvss.get(e.cveID);
            const arts = coverage.get(e.cveID) ?? [];
            return (
              <li key={e.cveID} className={`kev-item ${e.knownRansomware ? "kev-ransom" : ""}`}>
                <div className="kev-head">
                  <a
                    className={`cve ${sevClass(ref)}`}
                    href={`https://nvd.nist.gov/vuln/detail/${e.cveID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {e.cveID}
                    {ref?.score != null ? ` · ${ref.score.toFixed(1)}` : ""}
                  </a>
                  {e.knownRansomware ? <span className="kev-ransom-badge">🦠 ランサム</span> : null}
                  <span className="kev-added">追加 {jpDate(e.dateAdded)}</span>
                </div>
                <div className="kev-vendor">
                  {e.vendorProject} — {e.product}
                </div>
                <div className="kev-name">{e.vulnerabilityName}</div>
                {arts.length > 0 ? (
                  <div className="kev-coverage">
                    📰 関連記事:
                    {arts.slice(0, 3).map((a) => (
                      <Link key={a.id} href={`/article/${a.id}`} className="kev-cov-link">
                        {a.source}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <footer className="ftr">
        <p className="dim">
          出典: CISA KEV Catalog（{SHOW}件表示）。CVSS は NVD（キャッシュ＋少数ずつ取得）。
          「📰 関連記事」は本ダイジェストが取り込んだ記事との突合。
        </p>
      </footer>
    </main>
  );
}
