import type { SourceKind } from "./types";

// Small UI badge for a source kind. null for plain "news" (no badge).
export function kindBadge(kind: SourceKind): { label: string; cls: string } | null {
  switch (kind) {
    case "paper":
      return { label: "論文", cls: "k-paper" };
    case "research":
      return { label: "研究", cls: "k-research" };
    case "ai":
      return { label: "AI", cls: "k-ai" };
    default:
      return null;
  }
}
