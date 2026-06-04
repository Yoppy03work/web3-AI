import Link from "next/link";
import { searchArticles } from "@/lib/db";
import { getDigest } from "@/lib/digest";
import type { DigestItem } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = { searchParams: Promise<{ q?: string }> };

function kindBadge(kind: string): { label: string; cls: string } | null {
  if (kind === "paper") return { label: "論文", cls: "k-paper" };
  if (kind === "research") return { label: "研究", cls: "k-research" };
  return null;
}

function relJa(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

export default async function SearchPage({ searchParams }: SearchParams) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  // Warm the cache so search works even on a cold instance without Turso.
  await getDigest().catch(() => null);

  let results: DigestItem[] = [];
  if (query) {
    results = await searchArticles(query, 100).catch(() => []);
  }

  return (
    <main className="shell">
      <nav className="topnav">
        <Link href="/" className="back">← フィードに戻る</Link>
        <Link href="/bookmarks" className="back">★ 保存</Link>
        <Link href="/archive" className="back">アーカイブ</Link>
      </nav>

      <header className="hdr">
        <h1 className="title">
          <span className="prompt">$</span> grep
        </h1>
        <form className="search-form" action="/search" method="get">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="キーワード（例: lockbit, prompt injection, 暗号）"
            className="search-input"
            autoFocus
            aria-label="検索キーワード"
          />
          <button type="submit" className="search-btn">検索</button>
        </form>
        {query ? (
          <p className="dim" style={{ marginTop: "8px" }}>
            「{query}」の結果: {results.length} 件
          </p>
        ) : (
          <p className="dim" style={{ marginTop: "8px" }}>
            タイトル・要約・本文（日本語訳）を横断検索します。
          </p>
        )}
      </header>

      {query && results.length === 0 ? (
        <p className="empty">一致する記事はありません。別のキーワードでお試しください。</p>
      ) : (
        <ul className="cards">
          {results.map((it) => {
            const b = kindBadge(it.kind);
            return (
              <li key={it.id} className="card">
                <div className="card-head">
                  <span className="src">
                    {it.source}
                    {b ? <span className={`kind-badge ${b.cls}`}>{b.label}</span> : null}
                  </span>
                  <span className="when">{relJa(it.publishedAt)}</span>
                </div>
                <h2 className="card-title">
                  <Link href={`/article/${it.id}`}>{it.title}</Link>
                </h2>
                {it.summaryJa ? <p className="summary">{it.summaryJa}</p> : null}
                {it.tags.length > 0 ? (
                  <div className="tags">
                    {it.tags.map((t) => (
                      <span key={t} className="tag">#{t}</span>
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
          全文検索は Turso の FTS5（trigram）。2文字以下や FTS 無効時は LIKE で代替。
          履歴を増やすほど効く。
        </p>
      </footer>
    </main>
  );
}
