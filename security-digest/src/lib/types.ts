export type SourceKind = "news" | "research" | "paper" | "ai";

// Source language. "ja" sources are already Japanese, so the pipeline skips
// LLM summarization/translation for them (excerpt is shown as-is, body crawled
// and displayed directly).
export type SourceLang = "en" | "ja";

export type Source = {
  name: string;
  url: string;
  kind: SourceKind;
  lang?: SourceLang; // defaults to "en"
};

export type RawItem = {
  source: string;
  kind: SourceKind;
  lang: SourceLang;
  title: string;
  link: string;
  excerpt: string;
  publishedAt: string | null;
};

export type CvssSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type CveRef = {
  id: string; // canonical "CVE-2024-12345"
  // From NVD. null when not yet enriched or NVD had no score.
  score: number | null;
  severity: CvssSeverity | null;
  vector: string | null;
};

// A sibling article covering the same incident (different outlet).
export type RelatedRef = {
  id: string;
  source: string;
  title: string;
};

export type DigestItem = RawItem & {
  id: string;
  tags: string[];
  summaryJa: string | null;
  whyJa: string | null;
  llm: boolean;
  // Full body extracted from the article URL on demand. null while not yet
  // fetched. Populated lazily by the detail page on first visit.
  // Empty string ("") means "we tried and failed" — don't retry.
  body: string | null;
  // Japanese translation of `body`. Same lazy lifecycle.
  bodyJa: string | null;
  // CVE IDs mentioned in the article, enriched with CVSS from NVD when known.
  cves: CveRef[];
  // Other articles in this run covering the same incident (other outlets).
  // Only populated for cross-outlet clusters. Empty otherwise.
  related: RelatedRef[];
  // OG/Twitter thumbnail URL (fetched at build, best-effort). null if none.
  image: string | null;
};

export type Edition = "morning" | "evening";

export type Digest = {
  generatedAt: string;
  items: DigestItem[];
  tags: string[];
  llmEnabled: boolean;
  failedSources: string[];
  // ISO date "YYYY-MM-DD" (JST) — the archive bucket this digest belongs to.
  date: string;
  // Which daily run this is (07:00 JST = morning, 19:00 JST = evening).
  edition: Edition;
  // 3-line Japanese roll-up of the run. null when LLM is off / unavailable.
  tldr: string | null;
  // Fuller "今日のレポート" (labeled-section narrative). null when LLM is off.
  report: string | null;
};
