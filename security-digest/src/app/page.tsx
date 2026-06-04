import Link from "next/link";
import { getDigest } from "@/lib/digest";
import { getBookmarkedIds } from "@/lib/db";
import { SOURCES } from "@/lib/sources";
import FeedClient from "@/components/FeedClient";

export const dynamic = "force-dynamic";

function formatJst(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d) + " JST";
}

export default async function Page() {
  const digest = await getDigest();
  const savedIds = Array.from(await getBookmarkedIds().catch(() => new Set<string>()));

  return (
    <main className="shell">
      <header className="hdr">
        <div className="hdr-row">
          <h1 className="title">
            <span className="prompt">$</span> security-morning-digest
          </h1>
          <div className="meta">
            <span>更新: {formatJst(digest.generatedAt)}</span>
            <span>ソース: {SOURCES.length}</span>
            <span>記事: {digest.items.length}</span>
            <Link href="/bookmarks" className="meta-link">★ 保存</Link>
            <Link href="/archive" className="meta-link">アーカイブ →</Link>
          </div>
        </div>

        <div className="banners">
          <span className={`pill ${digest.llmEnabled ? "ok" : "warn"}`}>
            LLM: {digest.llmEnabled ? "有効" : "無効（英語抜粋を表示）"}
          </span>
          {digest.failedSources.length > 0 ? (
            <span className="pill err">
              取得失敗: {digest.failedSources.join(", ")}
            </span>
          ) : (
            <span className="pill ok">全ソース取得 OK</span>
          )}
        </div>
      </header>

      <FeedClient
        items={digest.items}
        tags={digest.tags}
        llmEnabled={digest.llmEnabled}
        savedIds={savedIds}
      />

      <footer className="ftr">
        <p>
          通学の5分で、世界の脅威動向を眺める。タグでフィルタしてから読み始めるのがおすすめ。
        </p>
        <p className="dim">
          generated at {digest.generatedAt} ·{" "}
          <a href="/api/digest" target="_blank" rel="noopener noreferrer">
            JSON
          </a>
        </p>
      </footer>
    </main>
  );
}
