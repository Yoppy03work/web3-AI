import Link from "next/link";
import { getDigestByDate, listArchiveDates, getDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";

function jpDate(d: string): string {
  // d is "YYYY-MM-DD" — render with weekday.
  const dt = new Date(`${d}T00:00:00+09:00`);
  if (isNaN(dt.getTime())) return d;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(dt);
}

export default async function ArchivePage() {
  // Make sure the in-memory cache is warm (so dev-without-KV at least shows today).
  await getDigest();

  const dates = await listArchiveDates();

  // Pull each day's snapshot (up to ~90). These are small JSON blobs.
  const snapshots = await Promise.all(
    dates.map(async (d) => ({ date: d, digest: await getDigestByDate(d) })),
  );

  return (
    <main className="shell">
      <nav className="topnav">
        <Link href="/" className="back">← フィードに戻る</Link>
      </nav>

      <header className="hdr">
        <h1 className="title">
          <span className="prompt">$</span> archive
        </h1>
        <p className="dim" style={{ marginTop: "6px" }}>
          毎朝 07:00 JST に生成されたスナップショットの一覧。最大 90 日分。
        </p>
      </header>

      {snapshots.length === 0 ? (
        <p className="empty">
          まだアーカイブはありません。明日以降、毎朝 07:00 JST に追加されます。
        </p>
      ) : (
        <ul className="archive-list">
          {snapshots.map(({ date, digest }) => (
            <li key={date} className="archive-day">
              <h2 className="archive-date">{jpDate(date)}</h2>
              {digest ? (
                <ul className="archive-items">
                  {digest.items.map((it) => (
                    <li key={it.id} className="archive-item">
                      <Link href={`/article/${it.id}`}>
                        <span className="archive-src">
                          {it.source}
                          {it.kind === "paper" ? (
                            <span className="kind-badge k-paper">論文</span>
                          ) : it.kind === "research" ? (
                            <span className="kind-badge k-research">研究</span>
                          ) : null}
                        </span>
                        <span className="archive-title">{it.title}</span>
                      </Link>
                      {it.tags.length > 0 ? (
                        <div className="tags">
                          {it.tags.map((t) => (
                            <span key={t} className="tag">#{t}</span>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dim">（このスナップショットは取得できませんでした）</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <footer className="ftr">
        <p className="dim">
          履歴は Upstash Redis に保存されています。未接続のローカル環境では当日分のみ表示。
        </p>
      </footer>
    </main>
  );
}
