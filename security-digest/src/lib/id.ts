// Stable, short ID for an article URL.
// We hash the *canonical* link (sans #fragment, same key we dedupe on) and
// take the first 10 hex chars. 10 hex = 40 bits = ~1 in a trillion collision
// odds for ~10k articles — plenty for a personal feed.

function canonicalLink(link: string): string {
  const hashIdx = link.indexOf("#");
  return hashIdx >= 0 ? link.slice(0, hashIdx) : link;
}

export async function articleId(link: string): Promise<string> {
  const canon = canonicalLink(link);
  const data = new TextEncoder().encode(canon);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 5; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex; // 10 hex chars
}
