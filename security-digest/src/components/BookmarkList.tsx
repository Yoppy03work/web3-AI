"use client";

import { useState } from "react";
import Link from "next/link";
import type { DigestItem } from "@/lib/types";
import BookmarkButton from "./BookmarkButton";
import CveBadges from "./CveBadges";
import { kindBadge } from "@/lib/kindBadge";

export default function BookmarkList({ items }: { items: DigestItem[] }) {
  const [list, setList] = useState(items);

  if (list.length === 0) {
    return (
      <p className="empty">
        まだ保存した記事はありません。フィードや記事ページの ☆ から保存できます。
      </p>
    );
  }

  return (
    <ul className="cards">
      {list.map((it) => {
        const b = kindBadge(it.kind);
        return (
          <li key={it.id} className="card">
            <div className="card-head">
              <span className="src">
                {it.source}
                {b ? <span className={`kind-badge ${b.cls}`}>{b.label}</span> : null}
              </span>
              <BookmarkButton
                id={it.id}
                initial={true}
                onChange={(on) => {
                  if (!on) setList((cur) => cur.filter((x) => x.id !== it.id));
                }}
              />
            </div>
            <h2 className="card-title">
              <Link href={`/article/${it.id}`}>{it.title}</Link>
            </h2>
            {it.summaryJa ? <p className="summary">{it.summaryJa}</p> : null}
            {it.whyJa ? (
              <div className="why">
                <span className="why-label">なぜ重要</span>
                <span className="why-body">{it.whyJa}</span>
              </div>
            ) : null}
            <CveBadges cves={it.cves} max={3} />
            <div className="card-foot">
              {it.tags.length > 0 ? (
                <div className="tags">
                  {it.tags.map((t) => (
                    <span key={t} className="tag">#{t}</span>
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
              >
                原文 ↗
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
