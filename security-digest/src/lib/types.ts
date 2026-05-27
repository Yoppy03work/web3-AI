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
  tags: string[];
  summaryJa: string | null;
  whyJa: string | null;
  llm: boolean;
};

export type Digest = {
  generatedAt: string;
  items: DigestItem[];
  tags: string[];
  llmEnabled: boolean;
  failedSources: string[];
};
