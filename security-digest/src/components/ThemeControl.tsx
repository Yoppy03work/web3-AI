"use client";

import { useEffect, useState } from "react";

// Light/dark theme toggle. Sets data-theme on <html> (CSS swaps the palette
// variables) and persists in localStorage. A no-FOUC inline script in
// layout.tsx applies the saved theme before paint; this just reflects/updates.
type Theme = "dark" | "light";

function readSaved(): Theme {
  if (typeof document !== "undefined") {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }
  return "dark";
}

export default function ThemeControl() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => setTheme(readSaved()), []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      className="themectl"
      onClick={toggle}
      aria-label={theme === "dark" ? "ライトモードに切替" : "ダークモードに切替"}
      title={theme === "dark" ? "ライトモード" : "ダークモード"}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
