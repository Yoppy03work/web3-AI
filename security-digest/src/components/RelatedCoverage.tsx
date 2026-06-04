import Link from "next/link";
import type { RelatedRef } from "@/lib/types";

// "続報" — same incident covered by other outlets. Plain component (no client
// hooks) so it works in both server pages and the client FeedClient.
export default function RelatedCoverage({
  related,
  variant = "inline",
}: {
  related: RelatedRef[] | undefined;
  variant?: "inline" | "block";
}) {
  if (!related || related.length === 0) return null;

  if (variant === "block") {
    return (
      <section className="related-block">
        <h2 className="section-h">続報・関連報道（{related.length}媒体）</h2>
        <ul className="related-list">
          {related.map((r) => (
            <li key={r.id}>
              <Link href={`/article/${r.id}`}>
                <span className="related-src">{r.source}</span>
                <span className="related-title">{r.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  // inline (feed card): a compact "🔗 続報: 媒体A・媒体B" line.
  const sources = Array.from(new Set(related.map((r) => r.source)));
  const shown = sources.slice(0, 3).join("・");
  const extra = sources.length - Math.min(sources.length, 3);
  return (
    <Link href={`/article/${related[0].id}`} className="related-inline" title="同じ事件の他媒体報道">
      🔗 続報 {shown}
      {extra > 0 ? ` +${extra}` : ""}（{related.length}件）
    </Link>
  );
}
