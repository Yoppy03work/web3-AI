// Empty plugins on purpose. Without this, Next walks up the directory tree
// looking for postcss.config in any ancestor and may pick up the parent
// project's Tailwind setup, which then pulls in lightningcss with a native
// binary mismatch and breaks `next build`. Keep this file even if it looks
// pointless — it shields us from inherited PostCSS config.
const config = { plugins: {} };

export default config;
