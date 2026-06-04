import type { DigestItem, RelatedRef } from "./types";

// "続報クラスタ": group articles that cover the same incident across outlets.
// Dependency-free. Signal = a shared CVE id, OR ≥2 shared *distinctive* title
// tokens (proper nouns / product / group names). Generic English and security
// /ML boilerplate words are stopworded out so e.g. "ransomware" or "attack"
// alone never glue unrelated stories together. Only clusters spanning ≥2
// distinct sources are surfaced (a single outlet's own follow-up isn't a
// cross-outlet cluster, and same-source feeds like arXiv won't self-cluster).

const STOP = new Set([
  // common english
  "the", "a", "an", "and", "or", "but", "for", "nor", "of", "to", "in", "on",
  "at", "by", "with", "from", "as", "is", "are", "was", "were", "be", "been",
  "this", "that", "these", "those", "it", "its", "their", "his", "her", "your",
  "you", "they", "them", "new", "now", "via", "into", "over", "after", "before",
  "how", "why", "what", "when", "who", "can", "could", "will", "would", "may",
  "more", "most", "than", "then", "also", "about", "amid", "using", "used",
  "use", "two", "one", "first", "says", "said", "report", "reports", "reported",
  // security / ML generic — distinctive only when *combined* with a name, so
  // we exclude them from the "distinctive" count to avoid false clusters.
  "security", "cyber", "cyberattack", "cyberattacks", "attack", "attacks",
  "attackers", "hacker", "hackers", "hacking", "hacked", "malware", "ransomware",
  "vulnerability", "vulnerabilities", "vulnerable", "flaw", "flaws", "bug",
  "bugs", "exploit", "exploits", "exploited", "patch", "patches", "patched",
  "breach", "breaches", "breached", "data", "leak", "leaked", "phishing",
  "threat", "threats", "actor", "actors", "campaign", "victims", "victim",
  "millions", "thousands", "users", "accounts", "account", "devices", "device",
  "software", "systems", "system", "network", "networks", "server", "servers",
  "code", "remote", "critical", "high", "zero", "day", "zeroday", "rce",
  "backdoor", "botnet", "trojan", "stealer", "spyware", "warns", "warning",
  // paper / ML generic
  "model", "models", "learning", "neural", "detection", "framework", "analysis",
  "approach", "method", "methods", "system", "based", "towards", "novel",
  "evaluation", "robust", "adversarial", "language", "large", "generative",
]);

function sigTokens(it: DigestItem): Set<string> {
  const s = new Set<string>();
  for (const c of it.cves ?? []) s.add(c.id.toUpperCase());
  const text = it.title.toLowerCase();
  for (const raw of text.split(/[^a-z0-9.-]+/)) {
    const t = raw.replace(/^[.-]+|[.-]+$/g, "");
    if (t.length >= 4 && !STOP.has(t) && !/^\d+$/.test(t)) s.add("w:" + t);
  }
  return s;
}

// Linked if they share a CVE, or ≥2 distinctive (non-stopword) title tokens.
function linked(a: Set<string>, b: Set<string>): boolean {
  let cve = 0;
  let words = 0;
  for (const t of a) {
    if (!b.has(t)) continue;
    if (t.startsWith("CVE-")) cve++;
    else words++;
  }
  return cve >= 1 || words >= 2;
}

export function computeClusters(items: DigestItem[]): Map<string, RelatedRef[]> {
  const n = items.length;
  const sigs = items.map(sigTokens);

  // union-find
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (linked(sigs[i], sigs[j])) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  }

  const result = new Map<string, RelatedRef[]>();
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    const sources = new Set(idxs.map((i) => items[i].source));
    if (sources.size < 2) continue; // cross-outlet only
    for (const i of idxs) {
      result.set(
        items[i].id,
        idxs
          .filter((j) => j !== i)
          .map((j) => ({ id: items[j].id, source: items[j].source, title: items[j].title })),
      );
    }
  }
  return result;
}
