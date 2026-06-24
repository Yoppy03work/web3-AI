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
  // 日本語ソース: RSS抜粋が既に日本語なので LLM 要約/翻訳をスキップ（lang:"ja"）。
  { name: "Security NEXT", url: "https://www.security-next.com/feed", kind: "news", lang: "ja" },
  // IPA 重要なセキュリティ情報（緊急対策情報・注意喚起）。RSS 1.0/RDF だが既存の
  // <item> 経路でそのまま解釈できる。description が無く抜粋は空だが、タイトルが
  // 製品名+CVE 入りで説明的（CVE抽出・タグ付けはタイトルから効く）、本文は詳細
  // ページでクロール表示する。
  { name: "IPA 重要なセキュリティ情報", url: "https://www.ipa.go.jp/security/alert-rss.rdf", kind: "news", lang: "ja" },

  // ---- research (Black Hat lacks an RSS feed; these are the closest in caliber) ----
  { name: "Google Project Zero", url: "https://googleprojectzero.blogspot.com/feeds/posts/default", kind: "research" },
  { name: "PortSwigger Research", url: "https://portswigger.net/research/rss", kind: "research" },
  { name: "Cisco Talos", url: "https://blog.talosintelligence.com/rss/", kind: "research" },
  { name: "Unit 42", url: "https://unit42.paloaltonetworks.com/feed/", kind: "research" },

  // ---- papers ----
  { name: "arXiv cs.CR", url: "https://rss.arxiv.org/rss/cs.CR", kind: "paper" },
  { name: "IACR ePrint", url: "https://eprint.iacr.org/rss/rss.xml", kind: "paper" },

  // ---- AI (latest AI/LLM developments; kept to 2 focused sources so a
  //         security digest isn't swamped by general AI/tech-culture news) ----
  { name: "Simon Willison", url: "https://simonwillison.net/atom/everything/", kind: "ai" },
  { name: "The Decoder", url: "https://the-decoder.com/feed/", kind: "ai" },

  // ---- optional extras (verified live; uncomment to enable) ----
  // { name: "Ars Technica AI", url: "https://arstechnica.com/ai/feed/", kind: "ai" },
  // { name: "Cisco Talos", url: "https://blog.talosintelligence.com/rss/", kind: "research" },  // already enabled above
  // { name: "SANS ISC", url: "https://isc.sans.edu/rssfeed_full.xml", kind: "news" },
  // { name: "Google Security Blog", url: "https://security.googleblog.com/feeds/posts/default", kind: "news" },
  // { name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/", kind: "ai" },
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
    // 日本語
    "生成ai",
    "人工知能",
    "大規模言語モデル",
    "プロンプトインジェクション",
    "ディープフェイク",
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
    // 日本語
    "脆弱性",
    "ゼロデイ",
    "コード実行",
    "権限昇格",
    "悪用",
    "パッチ",
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
    // 日本語
    "ランサム",
    "身代金",
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
    // 日本語
    "フィッシング",
    "詐欺",
    "なりすまし",
    "標的型",
    "ソーシャルエンジニアリング",
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
    // 日本語
    "サプライチェーン",
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
    // 日本語
    "情報流出",
    "情報漏",
    "個人情報",
    "不正アクセス",
    "データ侵害",
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
    // 日本語
    "マルウェア",
    "ウイルス",
    "ウイルス感染",
    "バックドア",
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
    // 日本語（暗号資産=cryptocurrency の誤爆を避けるため「暗号」単体は入れない）
    "暗号化",
    "ポスト量子",
    "耐量子",
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
