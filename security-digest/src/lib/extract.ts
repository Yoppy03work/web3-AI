// Best-effort article body extraction. No external dependency.
//
// We grab the article URL, look for a likely "main content" container
// (<article>, <main>, common semantic IDs), strip noise (nav/aside/footer/
// script/style/iframe), and return paragraphs joined by blank lines so the
// detail page can render with `white-space: pre-wrap`.
//
// This is intentionally simple. Sites with weird DOMs will produce noisy
// or truncated bodies. That's fine — the "原文を読む" button is always
// available as the source of truth.

const FETCH_TIMEOUT_MS = 8000;
const BODY_MAX = 8000;
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
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(input: string): string {
  if (!input) return "";
  return input.replace(
    /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g,
    (m, body: string) => {
      if (body[0] === "#") {
        const isHex = body[1] === "x" || body[1] === "X";
        const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
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
    },
  );
}

function cleanInline(html: string): string {
  let s = html;
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  s = decodeEntities(s);
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ");
  s = s.replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function stripJunk(html: string): string {
  let s = html;
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");
  s = s.replace(/<style\b[\s\S]*?<\/style\s*>/gi, "");
  s = s.replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, "");
  s = s.replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, "");
  s = s.replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, "");
  s = s.replace(/<nav\b[\s\S]*?<\/nav\s*>/gi, "");
  s = s.replace(/<aside\b[\s\S]*?<\/aside\s*>/gi, "");
  s = s.replace(/<footer\b[\s\S]*?<\/footer\s*>/gi, "");
  s = s.replace(/<header\b[\s\S]*?<\/header\s*>/gi, "");
  s = s.replace(/<form\b[\s\S]*?<\/form\s*>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  return s;
}

// Cut everything from the first "related / recommended / comments / author bio /
// newsletter / navigation" marker onward. These trailing sections live inside
// the article container on many sites (e.g. BleepingComputer's
// cz-related-article-wrapp + "Related Articles:") and otherwise leak unrelated
// headlines into the body.
function cutTrailingSections(html: string): string {
  // Only strong, reliably-trailing markers — avoid generic ones like "share"
  // or "newsletter" that can appear *above* the article and chop the body.
  // (Per-paragraph boilerplate filtering handles those safely instead.)
  const markers: RegExp[] = [
    /<[^>]+class\s*=\s*["'][^"']*(?:related-article|cz-related|related-posts|related-stories|recommended-|cz-story-navigation|cz-post-comment|cz-full-bio)/i,
    /<h[1-6][^>]*>\s*(?:related articles?|related news|related stories|you may also like|more from)/i,
    /<(?:section|div)[^>]+(?:id|class)\s*=\s*["'][^"']*comments?["' ]/i,
  ];
  let cut = html.length;
  for (const re of markers) {
    const m = re.exec(html);
    if (m && m.index < cut && m.index > 400) cut = m.index;
  }
  return cut < html.length ? html.slice(0, cut) : html;
}

// Candidate article containers, by <p> richness. Matches both id and class
// forms (BleepingComputer uses class="articleBody", WordPress entry-content,
// etc.). The first matching close tag truncates nested layouts, so we also keep
// the whole document as a candidate and pick whichever yields the most text.
function candidateContainers(html: string): string[] {
  const out: string[] = [];
  const res: RegExp[] = [
    /<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi,
    /<main\b[^>]*>([\s\S]*?)<\/main\s*>/gi,
    /<div\b[^>]*\b(?:id|class)\s*=\s*["'][^"']*(?:articlebody|article-body|article_body|article-content|post-content|entry-content|story-body|storycontent|post-body|cz-news)[^"']*["'][^>]*>([\s\S]*?)<\/div\s*>/gi,
  ];
  for (const re of res) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      if (m[1] && m[1].length > 200) out.push(m[1]);
    }
  }
  out.push(html); // whole-document fallback
  return out;
}

const BOILERPLATE_RE =
  /\b(subscribe|newsletter|sign up|cookie|all rights reserved|read more|follow us|share this|advertisement|sponsored content|©|terms of (?:use|service)|privacy policy|create a free account|already have an account)\b/i;

function isBoilerplate(p: string): boolean {
  if (p.length < 40) return true;
  return BOILERPLATE_RE.test(p);
}

function paragraphsFrom(html: string): string[] {
  const re = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const txt = cleanInline(m[1]);
    if (isBoilerplate(txt)) continue;
    if (seen.has(txt)) continue; // de-dupe repeated paragraphs
    seen.add(txt);
    out.push(txt);
  }
  return out;
}

// Best container = the one whose paragraphs total the most text.
function bestParagraphs(html: string): string[] {
  let best: string[] = [];
  let bestLen = 0;
  for (const c of candidateContainers(html)) {
    const paras = paragraphsFrom(c);
    const len = paras.reduce((n, p) => n + p.length, 0);
    if (len > bestLen) {
      best = paras;
      bestLen = len;
    }
  }
  return best;
}

// Last-resort body: the page's meta/og description (one or two sentences).
function metaDescription(html: string): string | null {
  const re =
    /<meta[^>]+(?:property\s*=\s*["']og:description["']|name\s*=\s*["']description["'])[^>]*content\s*=\s*["']([^"']+)["']/i;
  const m = re.exec(html);
  if (!m) return null;
  const txt = cleanInline(m[1]);
  return txt.length >= 40 ? txt : null;
}

// SSRF guard: article links come from feeds (attacker-influenceable), so before
// the server fetches one we reject non-http(s) schemes and hosts that resolve to
// loopback / private / link-local / cloud-metadata ranges by literal IP.
// (DNS-rebinding to a private IP via a public name is not fully covered — a
// known limitation for a personal app; the metadata-IP literal attack is.)
function isPrivateIpLiteral(host: string): boolean {
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (host.includes(":")) {
    const h = host.replace(/^\[|\]$/g, "").toLowerCase();
    return (
      h === "::1" ||
      h === "::" ||
      h.startsWith("fc") ||
      h.startsWith("fd") || // unique-local
      h.startsWith("fe80") // link-local
    );
  }
  return false;
}

function isSafeFetchUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (isPrivateIpLiteral(host)) return false;
  return true;
}

export async function extractBody(url: string): Promise<string | null> {
  if (!isSafeFetchUrl(url)) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      redirect: "follow",
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "accept-language": "en;q=0.9,*;q=0.5",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // 1) drop trailing related/comments/bio sections, 2) strip nav/aside/etc.,
    // 3) pick the richest article container's paragraphs (boilerplate-filtered).
    const cleaned = stripJunk(cutTrailingSections(html));
    const paras = bestParagraphs(cleaned);

    if (paras.length === 0) {
      // Nothing parseable (often JS-rendered pages) — fall back to the page's
      // meta/og description so the detail page still shows *something*.
      return metaDescription(html);
    }
    const joined = paras.join("\n\n");
    return joined.length > BODY_MAX ? joined.slice(0, BODY_MAX) + "…" : joined;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
