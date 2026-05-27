import type { NextConfig } from "next";
import path from "node:path";

// Notes on intentional choices for this project:
// - `cacheComponents` is NOT enabled. The docs frequently suggest exporting
//   `unstable_instant` for instant client-side navigation, but that flag only
//   takes effect when `cacheComponents: true`. This app is a single route (/)
//   with client-side filtering, so the draft/instant machinery would add risk
//   for zero benefit. We keep route segment options (`dynamic`, `revalidate`)
//   available the classic way and rely on our own in-memory cache for freshness.
// - No `reactCompiler`. Keeps the dependency set minimal (no babel plugin).
// - `turbopack.root` is pinned to THIS directory so Next does not climb up to
//   a parent project's lockfile and pick up its config (Tailwind/PostCSS) by
//   accident.
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve("."),
  },
};

export default nextConfig;
