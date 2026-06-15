"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DigestItem, SourceKind } from "@/lib/types";
import BookmarkButton from "./BookmarkButton";
import CveBadges from "./CveBadges";
import RelatedCoverage from "./RelatedCoverage";
import { kindBadge } from "@/lib/kindBadge";

type Props = {
  items: DigestItem[];
  tags: string[];
  llmEnabled: boolean;
  savedIds: string[];
};

const ALL = "__all__";
const READ_KEY = "readIds";
const READ_CAP = 3000;

const KIND_LABEL: Record<SourceKind, string> = {
  news: "ニュース",
  research: "研究",
  paper: "論文",
  ai: "AI",
};

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

export default function FeedClient({ items, tags, llmEnabled, savedIds }: Props) {
  const [activeTag, setActiveTag] = useState<string>(ALL);
  const [activeKind, setActiveKind] = useState<string>(ALL);
  const [activeSource, setActiveSource] = useState<string>(ALL);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);

  // Read state is per-device, kept in localStorage. Load after mount so the
  // first client render matches the server (no hydration mismatch).
  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(READ_KEY);
      if (raw) setReadIds(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);

  function markRead(id: string) {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try {
        const arr = Array.from(next).slice(-READ_CAP);
        localStorage.setItem(READ_KEY, JSON.stringify(arr));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const tagCounts = useMemo(() => {
    const c: Record<string, number> = { [ALL]: items.length };
    for (const tag of tags) c[tag] = items.filter((it) => it.tags.includes(tag)).length;
    return c;
  }, [items, tags]);

  // Kinds present in this digest, in a stable order.
  const kinds = useMemo(() => {
    const order: SourceKind[] = ["news", "research", "paper", "ai"];
    return order.filter((k) => items.some((it) => it.kind === k));
  }, [items]);

  const sources = useMemo(
    () => Array.from(new Set(items.map((it) => it.source))).sort(),
    [items],
  );

  const visible = useMemo(() => {
    return items.filter((it) => {
      if (activeTag !== ALL && !it.tags.includes(activeTag)) return false;
      if (activeKind !== ALL && it.kind !== activeKind) return false;
      if (activeSource !== ALL && it.source !== activeSource) return false;
      if (unreadOnly && mounted && readIds.has(it.id)) return false;
      return true;
    });
  }, [items, activeTag, activeKind, activeSource, unreadOnly, readIds, mounted]);

  const unreadCount = mounted ? items.filter((it) => !readIds.has(it.id)).length : items.length;

  return (
    <section>
      {/* タグ */}
      <div className="chips" role="tablist" aria-label="興味タグ">
        <button type="button" className="chip" aria-pressed={activeTag === ALL} onClick={() => setActiveTag(ALL)}>
          すべて <span className="badge">{tagCounts[ALL] ?? 0}</span>
        </button>
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="chip"
            aria-pressed={activeTag === tag}
            onClick={() => setActiveTag(tag)}
          >
            {tag} <span className="badge">{tagCounts[tag] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* 種別・ソース・未読 */}
      <div className="filterbar">
        <div className="chips chips-sm" role="group" aria-label="種別">
          <button type="button" className="chip" aria-pressed={activeKind === ALL} onClick={() => setActiveKind(ALL)}>
            全種別
          </button>
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              className="chip"
              aria-pressed={activeKind === k}
              onClick={() => setActiveKind(k)}
            >
              {KIND_LABEL[k]} <span className="badge">{items.filter((it) => it.kind === k).length}</span>
            </button>
          ))}
        </div>

        <select
          className="src-select"
          aria-label="ソース"
          value={activeSource}
          onChange={(e) => setActiveSource(e.target.value)}
        >
          <option value={ALL}>全ソース</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="chip"
          aria-pressed={unreadOnly}
          onClick={() => setUnreadOnly((v) => !v)}
          title="既読を隠す"
        >
          未読のみ <span className="badge">{unreadCount}</span>
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="empty">該当する記事はありません。フィルタを変えてみてください。</p>
      ) : (
        <ul className="cards">
          {visible.map((it) => {
            const isRead = mounted && readIds.has(it.id);
            return (
              <li key={it.id} className={`card${isRead ? " read" : ""}`}>
                <div className="card-head">
                  <span className="src">
                    {it.source}
                    {(() => {
                      const b = kindBadge(it.kind);
                      return b ? <span className={`kind-badge ${b.cls}`}>{b.label}</span> : null;
                    })()}
                  </span>
                  <span className="when">
                    {isRead ? <span className="read-tag">既読</span> : null}
                    {relativeJa(it.publishedAt)}
                  </span>
                </div>
                <h2 className="card-title">
                  <Link href={`/article/${it.id}`} onClick={() => markRead(it.id)}>
                    {it.title}
                  </Link>
                  <BookmarkButton id={it.id} initial={savedSet.has(it.id)} />
                </h2>

                {it.image ? (
                  <Link href={`/article/${it.id}`} onClick={() => markRead(it.id)} className="card-thumb-link">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="card-thumb"
                      src={it.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                  </Link>
                ) : null}

                {it.summaryJa ? (
                  <p className="summary">{it.summaryJa}</p>
                ) : (
                  <p className="summary dim">（要約なし）</p>
                )}

                {it.lang === "ja" ? (
                  <p className="hint">（日本語ソース・原文の要約）</p>
                ) : it.llm ? null : (
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

                <CveBadges cves={it.cves} max={3} />
                <RelatedCoverage related={it.related} />

                <div className="card-foot">
                  {it.tags.length > 0 ? (
                    <div className="tags">
                      {it.tags.map((t) => (
                        <span key={t} className="tag">
                          #{t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span />
                  )}
                  <a
                    className="orig"
                    href={it.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => markRead(it.id)}
                    aria-label={`${it.title} の原文を新しいタブで開く`}
                  >
                    原文 ↗
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
