"use client";

import { useEffect, useState } from "react";

// Page font-size control. Sets data-font on <html> (CSS scales all rem text)
// and persists the choice in localStorage. A no-FOUC inline script in
// layout.tsx applies the saved size before paint; this component just reflects
// and updates it.
const SIZES = [
  { key: "sm", label: "小" },
  { key: "md", label: "中" },
  { key: "lg", label: "大" },
  { key: "xl", label: "特大" },
] as const;

type SizeKey = (typeof SIZES)[number]["key"];

function readSaved(): SizeKey {
  if (typeof document !== "undefined") {
    const cur = document.documentElement.dataset.font;
    if (cur === "sm" || cur === "md" || cur === "lg" || cur === "xl") return cur;
  }
  return "md";
}

export default function FontSizeControl() {
  const [size, setSize] = useState<SizeKey>("md");

  // Sync from whatever the no-FOUC script already applied.
  useEffect(() => setSize(readSaved()), []);

  function apply(next: SizeKey) {
    setSize(next);
    document.documentElement.dataset.font = next;
    try {
      localStorage.setItem("fontSize", next);
    } catch {
      /* ignore quota/private-mode errors */
    }
  }

  return (
    <div className="fontctl" role="group" aria-label="文字サイズ">
      <span className="fontctl-icon" aria-hidden="true">A</span>
      {SIZES.map((s) => (
        <button
          key={s.key}
          type="button"
          className="fontctl-btn"
          aria-pressed={size === s.key}
          onClick={() => apply(s.key)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
