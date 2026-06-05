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
            <Link href="/cve" className="meta-link">🛡 CVE特集</Link>
            <Link href="/search" className="meta-link">🔎 検索</Link>
            <Link href="/bookmarks" className="meta-link">★ 保存</Link>
            <Link href="/archive" className="meta-link">アーカイブ →</Link>
          </div>
        </div>

        <div className="banners">
          <span className="pill edition">
            {digest.edition === "morning" ? "🌅 朝刊" : "🌙 夕刊"}
          </span>
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

        {digest.tldr ? (
          <div className="tldr">
            <span className="tldr-label">今日の3行</span>
            <div className="tldr-body">
              {digest.tldr.split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        ) : null}

        {digest.report ? (
          <details className="report" open>
            <summary className="report-summary">📋 今日のレポート</summary>
            <div className="report-body">
              {digest.report.split("\n").map((line, i) => {
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
          </details>
        ) : null}
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
