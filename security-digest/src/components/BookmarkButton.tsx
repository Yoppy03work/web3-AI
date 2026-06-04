"use client";

import { useState } from "react";

type Props = {
  id: string;
  initial: boolean;
  size?: "sm" | "lg";
  // Optional: notify parent (used on the /bookmarks page to drop the card).
  onChange?: (on: boolean) => void;
};

export default function BookmarkButton({ id, initial, size = "sm", onChange }: Props) {
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);

  async function toggle(e: React.MouseEvent) {
    // Cards may be wrapped in links — never navigate when starring.
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    const next = !saved;
    setSaved(next); // optimistic
    setPending(true);
    try {
      const res = await fetch("/api/bookmark", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, on: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onChange?.(next);
    } catch {
      setSaved(!next); // revert on failure
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className={`bm ${size === "lg" ? "bm-lg" : ""} ${saved ? "bm-on" : ""}`}
      aria-pressed={saved}
      aria-label={saved ? "ブックマーク解除" : "ブックマーク"}
      title={saved ? "ブックマーク解除" : "ブックマーク"}
      onClick={toggle}
      disabled={pending}
    >
      <span aria-hidden="true">{saved ? "★" : "☆"}</span>
      {size === "lg" ? (
        <span className="bm-text">{saved ? "保存済み" : "保存"}</span>
      ) : null}
    </button>
  );
}
