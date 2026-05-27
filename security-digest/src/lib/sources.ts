import type { Source } from "./types";

export const SOURCES: Source[] = [
  { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews" },
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/" },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/" },
  { name: "Dark Reading", url: "https://www.darkreading.com/rss.xml" },
  { name: "Schneier on Security", url: "https://www.schneier.com/feed/atom/" },
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
    "openai",
    "gpt",
    "anthropic",
    "claude",
    "gemini",
    "copilot",
    "deepfake",
    "generative",
    "machine learning",
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
};

export function tagsFor(text: string): string[] {
  const haystack = (" " + text.toLowerCase() + " ").replace(/\s+/g, " ");
  const hits: string[] = [];
  for (const [tag, keywords] of Object.entries(TAGS)) {
    if (keywords.some((k) => haystack.includes(k))) hits.push(tag);
  }
  return hits;
}
