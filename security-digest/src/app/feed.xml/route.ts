import { getDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";

// Self-hosted RSS 2.0 feed of the latest digest — subscribe in any reader to
// get the Japanese summaries. Built by hand (zero deps).
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function siteUrl(): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

export async function GET() {
  const base = siteUrl();
  let items = "";
  let lastBuild = new Date().toUTCString();

  try {
    const digest = await getDigest();
    lastBuild = new Date(digest.generatedAt).toUTCString();
    items = digest.items
      .map((it) => {
        const pub = it.publishedAt ? new Date(it.publishedAt).toUTCString() : lastBuild;
        // Link to our detail page (Japanese summary + translated body live there).
        const link = `${base}/article/${it.id}`;
        const desc = it.summaryJa || it.excerpt || "";
        const cats = it.tags.map((t) => `    <category>${esc(t)}</category>`).join("\n");
        return [
          "  <item>",
          `    <title>${esc(it.title)}</title>`,
          `    <link>${esc(link)}</link>`,
          `    <guid isPermaLink="false">${esc(it.id)}</guid>`,
          `    <source url="${esc(it.link)}">${esc(it.source)}</source>`,
          `    <pubDate>${pub}</pubDate>`,
          `    <description>${esc(desc)}</description>`,
          cats,
          "  </item>",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");
  } catch {
    // serve an empty-but-valid feed on failure
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Security Morning Digest</title>
  <link>${esc(base)}</link>
  <description>海外セキュリティニュースの日本語要約ダイジェスト</description>
  <language>ja</language>
  <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
