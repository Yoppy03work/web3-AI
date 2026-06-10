import Link from "next/link";
import { listWeeklyReports } from "@/lib/db";
import { weekRangeLabel } from "@/lib/weekly";

export const dynamic = "force-dynamic";

// Same labeled-line rendering as the daily report on the home page:
// lines starting with 【見出し】 become a heading chip + text.
function ReportBody({ report }: { report: string }) {
  return (
    <div className="report-body">
      {report.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        const m = /^【(.+?)】\s*(.*)$/.exec(t);
        if (m) {
          return (
            <p key={i} className="report-line">
              <span className="report-h">{m[1]}</span>
              {m[2] ? <span> {m[2]}</span> : null}
            </p>
          );
        }
        return (
          <p key={i} className="report-line">
            {t}
          </p>
        );
      })}
    </div>
  );
}

export default async function WeeklyPage() {
  const reports = await listWeeklyReports(12).catch(() => []);

  return (
    <main className="shell">
      <nav className="topnav">
        <Link href="/" className="back">← フィードに戻る</Link>
        <Link href="/cve" className="back">🛡 CVE特集</Link>
        <Link href="/archive" className="back">アーカイブ</Link>
      </nav>

      <header className="hdr">
        <h1 className="title">
          <span className="prompt">$</span> weekly — 週報
        </h1>
        <p className="dim" style={{ marginTop: "6px" }}>
          毎週日曜 19:00 JST の夕刊と同時に、その週（月〜日）の総括を自動生成。
        </p>
      </header>

      {reports.length === 0 ? (
        <p className="empty">
          まだ週報はありません。次の日曜の夕刊更新時に最初の週報が生成されます。
        </p>
      ) : (
        <div className="weekly-list">
          {reports.map((r, idx) => (
            <details key={r.weekStart} className="report" open={idx === 0}>
              <summary className="report-summary">
                📅 {weekRangeLabel(r.weekStart)} の週報
              </summary>
              <ReportBody report={r.report} />
            </details>
          ))}
        </div>
      )}

      <footer className="ftr">
        <p className="dim">
          週報は Turso に保存（週ごとに1本、最大12週表示）。Slack にも同時配信。
        </p>
      </footer>
    </main>
  );
}
