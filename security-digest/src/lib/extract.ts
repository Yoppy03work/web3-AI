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

function findMainContainer(html: string): string {
  // Try, in order: <article>, common semantic IDs, <main>, then whole body.
  const tries: RegExp[] = [
    /<article\b[^>]*>([\s\S]*?)<\/article\s*>/i,
    /<div\b[^>]*\bid\s*=\s*["']?(?:content|main|article-body|post-content|entry-content)\b[^>]*>([\s\S]*?)<\/div\s*>/i,
    /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i,
    /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i,
  ];
  for (const re of tries) {
    const m = re.exec(html);
    if (m && m[1].length > 200) return m[1];
  }
  return html;
}

function paragraphsFrom(html: string): string[] {
  const re = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const txt = cleanInline(m[1]);
    if (txt.length >= 40) out.push(txt);
  }
  return out;
}

export async function extractBody(url: string): Promise<string | null> {
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
    const cleaned = stripJunk(html);
    const main = findMainContainer(cleaned);
    const paras = paragraphsFrom(main);
    if (paras.length === 0) return null;
    const joined = paras.join("\n\n");
    return joined.length > BODY_MAX ? joined.slice(0, BODY_MAX) + "…" : joined;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
