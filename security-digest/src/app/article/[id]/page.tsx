import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticle, patchArticle } from "@/lib/digest";
import { extractBody } from "@/lib/extract";
import { llmEnabled, translateLong } from "@/lib/summarize";

export const dynamic = "force-dynamic";

// Using the explicit shape rather than the generated PageProps<'/article/[id]'>
// helper: typegen-generated types aren't always populated before build, so a
// direct annotation is more portable.
type ArticleParams = { params: Promise<{ id: string }> };

function formatJst(iso: string | null): string {
  if (!iso) return "日時不明";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "日時不明";
  return (
    new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d) + " JST"
  );
}

export default async function ArticlePage({ params }: ArticleParams) {
  const { id } = await params;
  const article = await getArticle(id);
  if (!article) notFound();

  // --- lazy body extraction ---
  // Storage convention:
  //   body === null  → not attempted yet
  //   body === ""    → attempted, no extractable content (don't retry)
  //   body === "..." → ok
  let body = article.body;
  if (body == null) {
    const fetched = await extractBody(article.link);
    body = fetched ?? "";
    await patchArticle(id, { body }).catch(() => {});
  }
  const hasBody = body !== null && body !== "";

  // --- lazy translation ---
  // Storage convention is identical: null=not tried, ""=tried+failed, "..."=ok.
  let bodyJa = article.bodyJa;
  if (hasBody && bodyJa == null && llmEnabled()) {
    const translated = await translateLong(body as string);
    bodyJa = translated ?? "";
    await patchArticle(id, { bodyJa }).catch(() => {});
  }
  const hasJa = bodyJa !== null && bodyJa !== "";

  return (
    <main className="shell">
      <nav className="topnav">
        <Link href="/" className="back">← フィードに戻る</Link>
        <Link href="/archive" className="back">アーカイブ</Link>
      </nav>

      <article className="detail">
        <div className="detail-head">
          <span className="src">{article.source}</span>
          <span className="when">{formatJst(article.publishedAt)}</span>
        </div>

        <h1 className="detail-title">{article.title}</h1>

        {article.tags.length > 0 ? (
          <div className="tags detail-tags">
            {article.tags.map((t) => (
              <span key={t} className="tag">#{t}</span>
            ))}
          </div>
        ) : null}

        {article.summaryJa ? (
          <section className="detail-summary">
            <h2 className="section-h">日本語要約</h2>
            <p>{article.summaryJa}</p>
            {!article.llm ? (
              <p className="hint">（LLM 要約に失敗したため、英語原文の抜粋を表示）</p>
            ) : null}
          </section>
        ) : null}

        {article.whyJa ? (
          <div className="why">
            <span className="why-label">なぜ重要</span>
            <span className="why-body">{article.whyJa}</span>
          </div>
        ) : null}

        <section className="detail-body">
          <h2 className="section-h">
            本文
            {hasJa ? <span className="lang-tag">日本語訳</span> : null}
            {!hasJa && hasBody ? <span className="lang-tag warn">原文</span> : null}
          </h2>

          {hasJa ? (
            <div className="body-text">{bodyJa}</div>
          ) : hasBody ? (
            <>
              <p className="hint">
                {llmEnabled()
                  ? "（本文の日本語訳に失敗したため原文を表示）"
                  : "（LLM 無効のため翻訳できません。原文を表示）"}
              </p>
              <div className="body-text">{body}</div>
            </>
          ) : (
            <p className="empty">
              本文の自動抽出に失敗しました。原文をご確認ください。
            </p>
          )}

          {hasJa && hasBody ? (
            <details className="orig-toggle">
              <summary>原文（English）を表示</summary>
              <div className="body-text body-text-orig">{body}</div>
            </details>
          ) : null}
        </section>

        <a
          className="cta"
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          原文を読む ↗
        </a>
      </article>

      <footer className="ftr">
        <p className="dim">
          {article.source} · {formatJst(article.publishedAt)} · id={article.id}
        </p>
      </footer>
    </main>
  );
}
