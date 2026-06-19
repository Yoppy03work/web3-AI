import Link from "next/link";
import { getIncidents } from "@/lib/incidents";
import CveBadges from "@/components/CveBadges";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "YYYY-MM-DD" → "M月D日"
function fmtDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(m)}月${Number(day)}日`;
}

export default async function IncidentsPage() {
  const incidents = await getIncidents();

  return (
    <main className="shell">
      <nav className="topnav">
        <Link href="/" className="back">← フィードに戻る</Link>
        <Link href="/cve" className="back">🛡 CVE特集</Link>
        <Link href="/weekly" className="back">📅 週報</Link>
      </nav>

      <header className="hdr">
        <h1 className="title">
          <span className="prompt">$</span> incidents — ストーリー追跡
        </h1>
        <p className="lead">
          複数日にまたがるインシデントを、CVE共有や特徴語の一致で日付を超えて自動グループ化。
          直近 {7} 日のローリングウィンドウ・LLM 不使用。
        </p>
      </header>

      {incidents.length === 0 ? (
        <p className="empty">
          現在、複数日にまたがる継続中のストーリーはありません。
        </p>
      ) : (
        <ul className="incidents">
          {incidents.map((inc) => (
            <li key={inc.id} className="incident">
              <div className="incident-head">
                <h2 className="incident-title">{inc.title}</h2>
                <span className="incident-span">
                  {fmtDate(inc.firstDate)}〜{fmtDate(inc.lastDate)} · {inc.dayCount}日間 · {inc.articleCount}本 · {inc.sources.length}媒体
                </span>
              </div>

              {inc.cves.length > 0 || inc.tags.length > 0 ? (
                <div className="incident-meta">
                  <CveBadges cves={inc.cves} max={4} />
                  {inc.tags.slice(0, 6).map((t) => (
                    <span key={t} className="tag">#{t}</span>
                  ))}
                </div>
              ) : null}

              <ol className="timeline">
                {inc.days.map((day) => (
                  <li key={day.date} className="tl-day">
                    <div className="tl-marker">
                      <span className="tl-date">{fmtDate(day.date)}</span>
                      <span className="tl-label">{day.label}</span>
                    </div>
                    <ul className="tl-items">
                      {day.items.map((it) => (
                        <li key={it.id} className="tl-item">
                          <Link href={`/article/${it.id}`} className="tl-link">
                            {it.title}
                          </Link>
                          <span className="tl-src">{it.source}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}

      <footer className="ftr">
        <p className="dim">
          直近7日のローリングウィンドウ・CVE/特徴語の決定論的グループ化（LLM 不使用）。
          1日のみの話題は表示しません（≥2日にまたがる継続案件のみ）。
        </p>
      </footer>
    </main>
  );
}
