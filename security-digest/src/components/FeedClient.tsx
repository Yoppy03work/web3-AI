"use client";

import { useMemo, useState } from "react";
import type { DigestItem } from "@/lib/types";

type Props = {
  items: DigestItem[];
  tags: string[];
  llmEnabled: boolean;
};

const ALL = "__all__";

function relativeJa(iso: string | null): string {
  if (!iso) return "日時不明";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "日時不明";
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return "たった今";
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}日前`;
  const mo = Math.floor(d / 30);
  return `${mo}ヶ月前`;
}

export default function FeedClient({ items, tags, llmEnabled }: Props) {
  const [active, setActive] = useState<string>(ALL);

  const counts = useMemo(() => {
    const c: Record<string, number> = { [ALL]: items.length };
    for (const tag of tags) {
      c[tag] = items.filter((it) => it.tags.includes(tag)).length;
    }
    return c;
  }, [items, tags]);

  const visible = useMemo(
    () =>
      active === ALL ? items : items.filter((it) => it.tags.includes(active)),
    [items, active],
  );

  return (
    <section>
      <div className="chips" role="tablist" aria-label="興味タグ">
        <button
          type="button"
          className="chip"
          aria-pressed={active === ALL}
          onClick={() => setActive(ALL)}
        >
          すべて <span className="badge">{counts[ALL] ?? 0}</span>
        </button>
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="chip"
            aria-pressed={active === tag}
            onClick={() => setActive(tag)}
          >
            {tag} <span className="badge">{counts[tag] ?? 0}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="empty">該当する記事はありません。別のタグを選んでください。</p>
      ) : (
        <ul className="cards">
          {visible.map((it) => (
            <li key={it.link} className="card">
              <div className="card-head">
                <span className="src">{it.source}</span>
                <span className="when">{relativeJa(it.publishedAt)}</span>
              </div>
              <h2 className="card-title">
                <a href={it.link} target="_blank" rel="noopener noreferrer">
                  {it.title}
                </a>
              </h2>

              {it.summaryJa ? (
                <p className="summary">{it.summaryJa}</p>
              ) : (
                <p className="summary dim">（要約なし）</p>
              )}

              {it.llm ? null : (
                <p className="hint">
                  {llmEnabled
                    ? "（LLM 要約に失敗したため、英語原文の抜粋を表示）"
                    : "（LLM 無効のため、英語原文の抜粋を表示）"}
                </p>
              )}

              {it.whyJa ? (
                <div className="why">
                  <span className="why-label">なぜ重要</span>
                  <span className="why-body">{it.whyJa}</span>
                </div>
              ) : null}

              {it.tags.length > 0 ? (
                <div className="tags">
                  {it.tags.map((t) => (
                    <span key={t} className="tag">
                      #{t}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
