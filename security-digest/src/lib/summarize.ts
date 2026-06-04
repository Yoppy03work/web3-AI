import type { RawItem } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";
// Use the dated model ID — Anthropic accepts both, but the alias form has
// occasionally returned 404 from the Messages API. The dated ID is the most
// reliable. Override via LLM_MODEL env if you want a different snapshot.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 25_000;

export function llmEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export type Summary = {
  summaryJa: string | null;
  whyJa: string | null;
  llm: boolean;
};

type LlmEntry = {
  index: number;
  summaryJa?: string;
  whyJa?: string;
};

function fallbackSummaries(items: RawItem[]): Summary[] {
  return items.map((it) => ({
    summaryJa: it.excerpt || null,
    whyJa: null,
    llm: false,
  }));
}

function buildPrompt(items: RawItem[]): string {
  const list = items.map((it, i) => {
    const body = it.excerpt ? it.excerpt.slice(0, 600) : "";
    return `#${i}\nTITLE: ${it.title}\nSOURCE: ${it.source}\nEXCERPT: ${body}`;
  }).join("\n\n");

  return [
    "あなたはセキュリティニュースの編集者です。以下の英語記事それぞれについて、",
    "日本語の要約と「なぜ重要か」の一言を作成してください。",
    "",
    "出力は **JSON 配列のみ**。Markdown のコードフェンス（```）や前置き・後置きは禁止。",
    "各要素は次の形:",
    `  {"index": <記事の番号(整数)>, "summaryJa": "<2〜3文・全角120字程度の日本語要約>", "whyJa": "<1文・全角40字程度・なぜ重要か>"}`,
    "",
    "・summaryJa は事実ベースで簡潔に。固有名詞は原文ママでよい。",
    "・whyJa は読者（学生エンジニア）にとっての示唆を一言で。誇張せず、断定的すぎないトーン。",
    "・index は下の番号と必ず一致させること。",
    "",
    "---記事一覧---",
    list,
  ].join("\n");
}

function extractJsonArray(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("no JSON array in LLM response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export async function summarizeBatch(items: RawItem[]): Promise<Summary[]> {
  if (items.length === 0) return [];
  if (!llmEnabled()) return fallbackSummaries(items);

  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: buildPrompt(items) }],
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      // Read the body so the Vercel log tells us exactly why (404 wrong
      // model, 401 bad key, 429 rate limit, 529 overloaded, ...).
      const body = await res.text().catch(() => "<unreadable body>");
      // eslint-disable-next-line no-console
      console.warn(
        `[summarize] Anthropic HTTP ${res.status} (model=${model}); body: ${body.slice(0, 500)}`,
      );
      return fallbackSummaries(items);
    }

    const json = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = (json.content ?? [])
      .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
      .join("\n")
      .trim();

    const parsed = extractJsonArray(text);
    if (!Array.isArray(parsed)) throw new Error("LLM response was not a JSON array");

    // Map by index so missing/reordered entries don't shift everything.
    const byIndex = new Map<number, LlmEntry>();
    for (const raw of parsed) {
      if (raw && typeof raw === "object" && typeof (raw as LlmEntry).index === "number") {
        byIndex.set((raw as LlmEntry).index, raw as LlmEntry);
      }
    }

    return items.map((it, i): Summary => {
      const e = byIndex.get(i);
      const s = e?.summaryJa?.trim();
      const w = e?.whyJa?.trim();
      if (!s) {
        return { summaryJa: it.excerpt || null, whyJa: null, llm: false };
      }
      return { summaryJa: s, whyJa: w || null, llm: true };
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[summarize] error; falling back:", err);
    return fallbackSummaries(items);
  } finally {
    clearTimeout(timer);
  }
}

// Translate a long English body into natural Japanese. Used by the article
// detail page (lazy). Returns null on failure / missing key — callers should
// fall back to displaying the original English.
export async function translateLong(text: string): Promise<string | null> {
  if (!llmEnabled()) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const prompt = [
    "以下の英語記事本文を自然な日本語に翻訳してください。",
    "・段落構造は維持（空行で段落区切り）。Markdown 装飾は使わない。",
    "・固有名詞 / 製品名 / CVE 番号 / URL は原文ママ。",
    "・前置きや「翻訳結果:」のような添え書きは禁止。本文のみ返す。",
    "",
    "---原文---",
    trimmed,
  ].join("\n");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.warn(
        `[translateLong] Anthropic HTTP ${res.status} (model=${model}); body: ${body.slice(0, 300)}`,
      );
      return null;
    }
    const json = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const out = (json.content ?? [])
      .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
      .join("\n")
      .trim();
    return out || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[translateLong] error:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
