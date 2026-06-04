export type Source = {
  name: string;
  url: string;
};

export type RawItem = {
  source: string;
  title: string;
  link: string;
  excerpt: string;
  publishedAt: string | null;
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
};

export type Digest = {
  generatedAt: string;
  items: DigestItem[];
  tags: string[];
  llmEnabled: boolean;
  failedSources: string[];
  // ISO date "YYYY-MM-DD" (JST) — the archive bucket this digest belongs to.
  date: string;
};
