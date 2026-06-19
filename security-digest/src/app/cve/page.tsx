import Link from "next/link";
import { getKev } from "@/lib/kev";
import { computeVendorStats, computeWeeklyStats } from "@/lib/kevStats";
import { enrichCveIds } from "@/lib/digest";
import { articlesMentioningCves, type KevJa } from "@/lib/db";
import { ensureKevJa } from "@/lib/kevJa";
import type { CveRef, RelatedRef } from "@/lib/types";

export const dynamic = "force-dynamic";
// Cold-cache views run one bounded LLM translation call (~up to 25s) plus NVD
// lookups — give the function the same headroom as the other heavy routes.
export const maxDuration = 60;

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

  // Trend stats over the FULL catalog (not just the shown top-50).
  const weekly = computeWeeklyStats(kev.entries, 12);
  const vendors = computeVendorStats(kev.entries, 90, 15);
  const weekMax = Math.max(1, ...weekly.map((w) => w.total));

  // CVSS (cache-first, small NVD budget) + our own coverage cross-reference
  // + Japanese translations (cache-first; ≤12 new ones translated per view,
  // and the cron prewarms the cache so this is usually all cache hits).
  const [cvss, coverage, ja] = await Promise.all([
    enrichCveIds(ids).catch(() => new Map<string, CveRef>()),
    articlesMentioningCves(ids).catch(() => new Map<string, RelatedRef[]>()),
    ensureKevJa(shown, 12).catch(() => new Map<string, KevJa>()),
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

      {kev.entries.length > 0 ? (
        <section className="kev-trends">
          <div className="kev-card">
            <div className="kev-card-h">📈 KEV 登録数（過去12週）</div>
            <svg
              className="kev-spark"
              viewBox="0 0 360 64"
              preserveAspectRatio="none"
              role="img"
              aria-label="過去12週のKEV週次登録数"
            >
              {weekly.map((w, i) => {
                const totalH = (w.total / weekMax) * 46;
                const ransH = (w.ransomware / weekMax) * 46;
                const x = i * 30 + 5;
                return (
                  <g key={w.weekStart}>
                    <rect x={x} y={58 - totalH} width={20} height={totalH} className="spark-total" />
                    {ransH > 0 ? (
                      <rect x={x} y={58 - ransH} width={20} height={ransH} className="spark-ransom" />
                    ) : null}
                  </g>
                );
              })}
              <line x1="0" y1="58" x2="360" y2="58" className="spark-base" />
            </svg>
            <div className="kev-card-foot">
              <span>
                最新週 <b>{weekly[weekly.length - 1].total}</b> 件（🦠 {weekly[weekly.length - 1].ransomware}）
              </span>
              <span className="dim">青=登録 / 赤=ランサム</span>
            </div>
          </div>

          {vendors.vendors.length > 0 ? (
            <div className="kev-card">
              <div className="kev-card-h">🏢 ベンダー別 KEV（過去90日・上位{vendors.vendors.length}）</div>
              <ul className="vendor-list">
                {vendors.vendors.map((v) => (
                  <li key={v.vendor} className="vendor-row">
                    <span className="vendor-name" title={v.vendor}>{v.vendor}</span>
                    <span className="vendor-bar">
                      <span
                        className="vendor-fill"
                        style={{ width: `${(v.count / vendors.max) * 100}%` }}
                      />
                    </span>
                    <span className="vendor-count">{v.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {shown.length === 0 ? (
        <p className="empty">KEV を取得できませんでした。時間をおいて再読み込みしてください。</p>
      ) : (
        <ul className="kev-list">
          {shown.map((e) => {
            const ref = cvss.get(e.cveID);
            const arts = coverage.get(e.cveID) ?? [];
            const t = ja.get(e.cveID);
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
                <div className="kev-name" title={t?.nameJa ? e.vulnerabilityName : undefined}>
                  {t?.nameJa ?? e.vulnerabilityName}
                </div>
                {t?.descJa ? (
                  <p className="kev-desc">{t.descJa}</p>
                ) : e.shortDescription ? (
                  <p className="kev-desc kev-desc-en">{e.shortDescription}</p>
                ) : null}
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
          脆弱性名・説明は LLM による日本語訳（翻訳済みから順次表示、未訳は英語のまま）。
          「📰 関連記事」は本ダイジェストが取り込んだ記事との突合。
        </p>
      </footer>
    </main>
  );
}
