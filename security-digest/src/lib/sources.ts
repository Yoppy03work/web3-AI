import type { Source } from "./types";

// kind drives a small UI badge and lets you filter news vs. papers vs. research.
//   news     — vendor / press security news
//   research — deep technical research blogs (Black Hat-grade write-ups)
//   paper    — academic preprints / archives
export const SOURCES: Source[] = [
  // ---- news ----
  { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", kind: "news" },
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/", kind: "news" },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", kind: "news" },
  { name: "Dark Reading", url: "https://www.darkreading.com/rss.xml", kind: "news" },
  { name: "Schneier on Security", url: "https://www.schneier.com/feed/atom/", kind: "news" },

  // ---- research (Black Hat lacks an RSS feed; these are the closest in caliber) ----
  { name: "Google Project Zero", url: "https://googleprojectzero.blogspot.com/feeds/posts/default", kind: "research" },
  { name: "PortSwigger Research", url: "https://portswigger.net/research/rss", kind: "research" },

  // ---- papers ----
  { name: "arXiv cs.CR", url: "https://rss.arxiv.org/rss/cs.CR", kind: "paper" },
  { name: "IACR ePrint", url: "https://eprint.iacr.org/rss/rss.xml", kind: "paper" },

  // ---- optional extras (verified live; uncomment to enable) ----
  // { name: "Cisco Talos", url: "https://blog.talosintelligence.com/rss/", kind: "research" },
  // { name: "Unit 42", url: "https://unit42.paloaltonetworks.com/feed/", kind: "research" },
  // { name: "SANS ISC", url: "https://isc.sans.edu/rssfeed_full.xml", kind: "news" },
  // { name: "Google Security Blog", url: "https://security.googleblog.com/feeds/posts/default", kind: "news" },
];

// Interest tags. Order here is preserved when listing tags in the UI.
// Matching: lowercase substring against (title + " " + excerpt).
// Keep keywords lowercase. Partial matches are intentional (e.g. "vulnerabilit"
// covers "vulnerability" / "vulnerabilities").
export const TAGS: Record<string, string[]> = {
  "AI/LLM": [
    "ai ",
    " ai",
    "llm",
    "prompt injection",
    "jailbreak",
    "adversarial",
    "openai",
    "gpt",
    "anthropic",
    "claude",
    "gemini",
    "copilot",
    "deepfake",
    "generative",
    "machine learning",
    "neural network",
    "chatbot",
    "model context protocol",
    "mcp ",
  ],
  "脆弱性/CVE": [
    "vulnerabilit",
    "cve-",
    "zero-day",
    "zero day",
    "0-day",
    "rce",
    "remote code execution",
    "exploit",
    "patch",
    "buffer overflow",
    "use-after-free",
    "privilege escalation",
    "side-channel",
    "sql injection",
    "xss",
  ],
  "ランサムウェア": [
    "ransom",
    "lockbit",
    "blackcat",
    "alphv",
    "clop",
    "akira",
    "royal ransom",
    "play ransom",
    "extortion",
    "double extortion",
  ],
  "ソーシャル/フィッシング": [
    "phish",
    "social engineering",
    "smish",
    "vishing",
    "spear-phish",
    "business email compromise",
    "bec ",
    "impersonat",
    "credential theft",
    "fake login",
  ],
  "サプライチェーン": [
    "supply chain",
    "supply-chain",
    "npm package",
    "pypi",
    "rubygems",
    "typosquat",
    "typo-squat",
    "dependency confusion",
    "malicious package",
    "open source",
    "sbom",
  ],
  "データ侵害": [
    "data breach",
    "breach",
    "leak",
    "leaked",
    "exposed database",
    "stolen data",
    "data theft",
    "exfiltrat",
    "records exposed",
  ],
  "マルウェア": [
    "malware",
    "trojan",
    "rootkit",
    "infostealer",
    "stealer",
    "spyware",
    "backdoor",
    "botnet",
    "loader",
    "wiper",
    "worm",
    "rat ",
    "remote access trojan",
  ],
  "暗号/Crypto": [
    "cryptograph",
    "encryption",
    "cipher",
    "post-quantum",
    "zero-knowledge",
    "homomorphic",
    "elliptic curve",
    "signature scheme",
    "lattice",
    "tls ",
    "key exchange",
  ],
};

export function tagsFor(text: string): string[] {
  const haystack = (" " + text.toLowerCase() + " ").replace(/\s+/g, " ");
  const hits: string[] = [];
  for (const [tag, keywords] of Object.entries(TAGS)) {
    if (keywords.some((k) => haystack.includes(k))) hits.push(tag);
  }
  return hits;
}
