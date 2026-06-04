import type { RawItem, Source } from "./types";

const FETCH_TIMEOUT_MS = 9000;
const PER_SOURCE_MAX = 12;
const EXCERPT_MAX = 320;
const UA =
  "Mozilla/5.0 (compatible; SecurityDigest/0.1; +https://example.com/security-digest)";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(input: string): string {
  if (!input) return "";
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const codeStr = isHex ? body.slice(2) : body.slice(1);
      const code = parseInt(codeStr, isHex ? 16 : 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return m;
        }
      }
      return m;
    }
    return NAMED_ENTITIES[body] ?? m;
  });
}

// Order matters here. Atom <content type="html"> bodies arrive HTML-escaped
// (e.g. "&lt;p&gt;hello&lt;/p&gt;"). If we stripped tags first, "<p>" would
// stay as literal text in the excerpt. So: strip CDATA → decode entities →
// drop script/style → strip remaining tags → decode again (for entities that
// were inside CDATA) → collapse whitespace.
export function cleanText(input: string | null | undefined, max = EXCERPT_MAX): string {
  if (!input) return "";
  let s = input;
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  s = decodeEntities(s);
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ");
  s = s.replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + "…";
  return s;
}

function pickFirstTag(xml: string, tag: string): string | null {
  // Matches <tag>…</tag>, including namespaced forms like dc:date.
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${safe}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${safe}\\s*>`, "i");
  const m = re.exec(xml);
  return m ? m[1] : null;
}

function pickAttr(tagOpen: string, attr: string): string | null {
  const re = new RegExp(`${attr}\\s*=\\s*"([^"]*)"|${attr}\\s*=\\s*'([^']*)'`, "i");
  const m = re.exec(tagOpen);
  if (!m) return null;
  return m[1] ?? m[2] ?? null;
}

function pickAtomLink(xml: string): string | null {
  // Collect every <link …/> tag, then prefer rel="alternate", then no rel.
  const links: { rel: string | null; href: string | null }[] = [];
  const re = /<link\b([^>]*)\/?>(?:\s*<\/link\s*>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    links.push({ rel: pickAttr(attrs, "rel"), href: pickAttr(attrs, "href") });
  }
  const alternate = links.find((l) => l.rel === "alternate" && l.href);
  if (alternate?.href) return alternate.href;
  const noRel = links.find((l) => (l.rel === null || l.rel === "") && l.href);
  if (noRel?.href) return noRel.href;
  const first = links.find((l) => l.href);
  return first?.href ?? null;
}

function toIso(raw: string | null): string | null {
  if (!raw) return null;
  const s = cleanText(raw, 64);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function splitItems(xml: string, tag: "item" | "entry"): string[] {
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi");
  return xml.match(re) ?? [];
}

function isAtom(xml: string): boolean {
  // Atom feeds use <feed xmlns="http://www.w3.org/2005/Atom"> and <entry>.
  // Plain detection: <entry> exists and <item> doesn't, OR the feed root
  // declares the Atom namespace.
  if (/<feed\b[^>]*xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(xml)) return true;
  const hasEntry = /<entry\b/i.test(xml);
  const hasItem = /<item\b/i.test(xml);
  return hasEntry && !hasItem;
}

function parseRssItem(xml: string, source: Source): RawItem | null {
  const title = cleanText(pickFirstTag(xml, "title"), 240);
  // RSS link is element text, not an attribute.
  const linkRaw = pickFirstTag(xml, "link");
  const link = linkRaw ? cleanText(linkRaw, 2048) : "";
  const desc =
    pickFirstTag(xml, "content:encoded") ??
    pickFirstTag(xml, "description") ??
    pickFirstTag(xml, "summary");
  const date =
    pickFirstTag(xml, "pubDate") ??
    pickFirstTag(xml, "dc:date") ??
    pickFirstTag(xml, "published") ??
    pickFirstTag(xml, "updated");
  if (!title || !link) return null;
  return {
    source: source.name,
    kind: source.kind,
    title,
    link,
    excerpt: cleanText(desc, EXCERPT_MAX),
    publishedAt: toIso(date),
  };
}

function parseAtomEntry(xml: string, source: Source): RawItem | null {
  const title = cleanText(pickFirstTag(xml, "title"), 240);
  const link = pickAtomLink(xml);
  const desc =
    pickFirstTag(xml, "content") ??
    pickFirstTag(xml, "summary") ??
    pickFirstTag(xml, "description");
  const date =
    pickFirstTag(xml, "published") ??
    pickFirstTag(xml, "updated") ??
    pickFirstTag(xml, "dc:date");
  if (!title || !link) return null;
  return {
    source: source.name,
    kind: source.kind,
    title,
    link: cleanText(link, 2048),
    excerpt: cleanText(desc, EXCERPT_MAX),
    publishedAt: toIso(date),
  };
}

export function parseFeed(xml: string, source: Source): RawItem[] {
  const items: RawItem[] = [];
  if (isAtom(xml)) {
    for (const entry of splitItems(xml, "entry")) {
      const parsed = parseAtomEntry(entry, source);
      if (parsed) items.push(parsed);
    }
  } else {
    for (const item of splitItems(xml, "item")) {
      const parsed = parseRssItem(item, source);
      if (parsed) items.push(parsed);
    }
  }
  return items.slice(0, PER_SOURCE_MAX);
}

async function fetchOne(source: Source): Promise<{ items: RawItem[]; failed: boolean }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(source.url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        "user-agent": UA,
        accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5",
      },
    });
    if (!res.ok) return { items: [], failed: true };
    const xml = await res.text();
    return { items: parseFeed(xml, source), failed: false };
  } catch {
    return { items: [], failed: true };
  } finally {
    clearTimeout(t);
  }
}

function dedupKey(link: string): string {
  // Drop fragment but keep the rest of the URL verbatim; querystrings can
  // be meaningful (utm_* aside, but we accept the false positives).
  const hashIdx = link.indexOf("#");
  return hashIdx >= 0 ? link.slice(0, hashIdx) : link;
}

export async function fetchAllFeeds(
  sources: Source[],
): Promise<{ items: RawItem[]; failedSources: string[] }> {
  const settled = await Promise.allSettled(sources.map((s) => fetchOne(s)));
  const all: RawItem[] = [];
  const failed: string[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled" && !r.value.failed) {
      all.push(...r.value.items);
    } else {
      failed.push(sources[i].name);
    }
  });

  // Dedup by link (sans fragment), keeping the earliest occurrence.
  const seen = new Set<string>();
  const deduped: RawItem[] = [];
  for (const item of all) {
    const key = dedupKey(item.link);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  // Newest first; items without a parseable date go to the end.
  deduped.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });

  return { items: deduped, failedSources: failed };
}

// High-volume feeds (arXiv announces ~80 papers/day with fresh timestamps)
// would otherwise dominate a purely date-sorted top-N and crowd out news.
// This keeps the date ordering but caps how many consecutive slots any single
// source may take, producing a varied front page.
export function diversify(
  items: RawItem[],
  limit: number,
  perSourceCap: number,
): RawItem[] {
  const picked: RawItem[] = [];
  const used = new Map<string, number>();
  const overflow: RawItem[] = [];
  for (const it of items) {
    if (picked.length >= limit) break;
    const n = used.get(it.source) ?? 0;
    if (n < perSourceCap) {
      picked.push(it);
      used.set(it.source, n + 1);
    } else {
      overflow.push(it);
    }
  }
  // If the cap left us short of `limit` (few sources had fresh items), backfill
  // from the overflow in date order so we always return up to `limit`.
  for (const it of overflow) {
    if (picked.length >= limit) break;
    picked.push(it);
  }
  return picked;
}
