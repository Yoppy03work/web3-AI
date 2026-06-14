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
    "読み応えのある日本語の要約と「なぜ重要か」の一言を作成してください。",
    "",
    "出力は **JSON 配列のみ**。Markdown のコードフェンス（```）や前置き・後置きは禁止。",
    "各要素は次の形:",
    `  {"index": <記事の番号(整数)>, "summaryJa": "<4〜6文・全角300字程度の日本語要約>", "whyJa": "<1文・全角40字程度・なぜ重要か>"}`,
    "",
    "・summaryJa は事実ベースで、何が・誰に・どう影響するか、対象製品/バージョン、",
    "  攻撃手法や対策（パッチ有無など）まで、抜粋から分かる範囲で具体的に。全角300字程度。",
    "・抜粋に書かれていない事実は創作しない。推測は避け、分かる範囲で書く。",
    "・固有名詞・製品名・CVE 番号は原文ママでよい。",
    "・whyJa は読者（学生エンジニア）にとっての示唆を一言で。誇張せず、断定的すぎないトーン。",
    "・index は下の番号と必ず一致させること。",
    "",
    "---記事一覧---",
    list,
  ].join("\n");
}

function extractJsonArray(text: string): unknown {
  // Try the whole response first (handles clean output and ```json fences).
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // fall through to a balanced scan
  }
  // Find the first *balanced* top-level array starting at the first "[".
  // String-aware so brackets inside summary strings (e.g. "[PoC]") and any
  // trailing prose ("…see [1]") don't corrupt the slice.
  const start = stripped.indexOf("[");
  if (start < 0) throw new Error("no JSON array in LLM response");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < stripped.length; i++) {
    const c = stripped[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return JSON.parse(stripped.slice(start, i + 1));
    }
  }
  throw new Error("no balanced JSON array in LLM response");
}

// Max articles per LLM call. Long (~300 char) Japanese summaries × many items
// can exceed max_tokens and truncate the JSON array → the whole batch would
// fall back to English. Chunking keeps each call's output well under the limit
// and isolates failures to one chunk.
const SUMMARY_CHUNK = 9;

export async function summarizeBatch(items: RawItem[]): Promise<Summary[]> {
  if (items.length === 0) return [];
  if (!llmEnabled()) return fallbackSummaries(items);

  if (items.length <= SUMMARY_CHUNK) return summarizeChunk(items);

  const chunks: RawItem[][] = [];
  for (let i = 0; i < items.length; i += SUMMARY_CHUNK) {
    chunks.push(items.slice(i, i + SUMMARY_CHUNK));
  }
  const results = await Promise.all(chunks.map((c) => summarizeChunk(c)));
  return results.flat();
}

const MAX_ATTEMPTS = 2; // 1 retry
const RETRY_BASE_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type ChunkOutcome =
  | { kind: "ok"; summaries: Summary[] }
  | { kind: "retry" } // transient: 429 / 5xx / network / parse failure
  | { kind: "fatal" }; // won't be fixed by retry: 400 / 401 / 403 / 404

// One chunk, with retry on transient failures. Each call's output is bounded
// (≤ SUMMARY_CHUNK items) and max_tokens is generous so the JSON array isn't
// truncated. Parallel chunks can briefly trip a 429 — a short backoff + retry
// recovers without falling the whole chunk back to English.
async function summarizeChunk(items: RawItem[]): Promise<Summary[]> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const r = await tryChunkOnce(items);
    if (r.kind === "ok") return r.summaries;
    if (r.kind === "fatal") break;
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_BASE_MS * attempt);
  }
  return fallbackSummaries(items);
}

async function tryChunkOnce(items: RawItem[]): Promise<ChunkOutcome> {
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
        max_tokens: 16000,
        messages: [{ role: "user", content: buildPrompt(items) }],
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable body>");
      // eslint-disable-next-line no-console
      console.warn(
        `[summarize] Anthropic HTTP ${res.status} (model=${model}); body: ${body.slice(0, 300)}`,
      );
      // 429 (rate limit) and 5xx (incl. 529 overloaded) are transient → retry.
      if (res.status === 429 || res.status >= 500) return { kind: "retry" };
      return { kind: "fatal" };
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

    const byIndex = new Map<number, LlmEntry>();
    for (const raw of parsed) {
      if (raw && typeof raw === "object" && typeof (raw as LlmEntry).index === "number") {
        byIndex.set((raw as LlmEntry).index, raw as LlmEntry);
      }
    }

    const summaries = items.map((it, i): Summary => {
      const e = byIndex.get(i);
      const s = e?.summaryJa?.trim();
      const w = e?.whyJa?.trim();
      if (!s) return { summaryJa: it.excerpt || null, whyJa: null, llm: false };
      return { summaryJa: s, whyJa: w || null, llm: true };
    });
    return { kind: "ok", summaries };
  } catch (err) {
    // Network abort / JSON parse failure → transient, worth one retry.
    // eslint-disable-next-line no-console
    console.warn("[summarize] chunk error (will retry if attempts remain):", err);
    return { kind: "retry" };
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
        max_tokens: 8192,
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

// Parse the model's bullet output into up to `max` clean lines. Splits ONLY at
// line-leading "・" markers — so an in-sentence middle-dot (e.g. "Fable 5・
// Mythos 5") is NOT treated as a new bullet, and a bullet the model soft-wrapped
// across multiple physical lines is merged (its continuation isn't discarded).
function parseBullets(out: string, max: number): string | null {
  const text = out.trim();
  if (!text) return null;
  const first = text.indexOf("・");
  if (first < 0) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, max);
    return lines.length ? lines.join("\n") : null;
  }
  const bullets = text
    .slice(first)
    .split(/\n\s*・/) // only newline-then-marker starts a new bullet
    .map((s) => s.replace(/^・/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, max)
    .map((s) => "・" + s);
  return bullets.length ? bullets.join("\n") : null;
}

// Roll up the run's items into a short Japanese TL;DR (3 bullet lines). One LLM
// call. Returns null on missing key / failure — the UI just hides the box.
export async function summarizeTldr(
  items: Array<{ title: string; source: string; summaryJa: string | null; excerpt: string }>,
): Promise<string | null> {
  if (!llmEnabled() || items.length === 0) return null;

  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const list = items
    .slice(0, 12)
    .map((it, i) => `#${i} [${it.source}] ${it.title} — ${(it.summaryJa || it.excerpt || "").slice(0, 160)}`)
    .join("\n");

  const prompt = [
    "あなたはセキュリティ編集者です。以下は本日のダイジェスト記事一覧です。",
    "全体を俯瞰し、今おさえるべき要点を日本語で『3行』にまとめてください。",
    "・各行は「・」で始める箇条書き、1行あたり全角40〜60字程度。",
    "・最も重要・影響範囲が広い動向を優先。固有名詞や CVE 番号は残す。",
    "・前置きや見出しは禁止。3行のみを返す。",
    "",
    "---記事一覧---",
    list,
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
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.warn(`[tldr] Anthropic HTTP ${res.status}; body: ${body.slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    const out = (json.content ?? [])
      .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
      .join("\n")
      .trim();
    return parseBullets(out, 3);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[tldr] error:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type ReportItem = {
  title: string;
  source: string;
  kind: string;
  summaryJa: string | null;
  excerpt: string;
  topSeverity: string | null;
};

// A fuller "今日のレポート" than the 3-line TL;DR: a short structured digest of
// the day's themes. Returns a labeled-section plain-text block (the home page
// parses 【見出し】lines into headings). One LLM call; null on missing key.
export async function summarizeReport(items: ReportItem[]): Promise<string | null> {
  if (!llmEnabled() || items.length === 0) return null;

  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const list = items
    .slice(0, 18)
    .map(
      (it, i) =>
        `#${i} [${it.source}/${it.kind}]${it.topSeverity ? `(CVSS:${it.topSeverity})` : ""} ${it.title} — ${(it.summaryJa || it.excerpt || "").slice(0, 200)}`,
    )
    .join("\n");

  const prompt = [
    "あなたはセキュリティ編集長です。以下は本日のダイジェスト記事一覧です。",
    "全体を俯瞰し、読者（学生エンジニア）向けの『今日のレポート』を日本語で書いてください。",
    "次の見出しを使い、各見出しの後に2〜3文（または短い箇条書き）で内容を書く:",
    "【概況】今日の全体傾向を2文程度で。",
    "【注目の脅威・インシデント】最も影響が大きい事案。固有名詞は残す。",
    "【脆弱性 / CVE】悪用・パッチが要る重要な脆弱性（CVE番号があれば明記）。無ければ「目立った新規CVEなし」。",
    "【AI 動向】AI/LLM 関連の注目トピック。無ければ省略可。",
    "【その他の話題】今コミュニティで話題の事柄を1〜2点。",
    "",
    "制約: 各見出しは行頭に【】付きで。誇張せず事実ベース。抜粋にない事実は創作しない。",
    "前置き・後置き・コードフェンスは禁止。全体で600字程度に収める。",
    "",
    "---記事一覧---",
    list,
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
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.warn(`[report] Anthropic HTTP ${res.status}; body: ${body.slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    const out = (json.content ?? [])
      .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
      .join("\n")
      .trim();
    return out || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[report] error:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type KevTranslateInput = { id: string; name: string; desc: string };
export type KevTranslateResult = { nameJa: string | null; descJa: string | null };

const KEV_TRANSLATE_CHUNK = 15;

// Translate KEV entries (vulnerability name + short description) to Japanese.
// One LLM call per chunk; returns a map id→translation. Missing key / failure
// returns an empty map (callers fall back to English). Results are meant to be
// cached by the caller — KEV text never changes for a given CVE.
export async function translateKevBatch(
  entries: KevTranslateInput[],
): Promise<Map<string, KevTranslateResult>> {
  const out = new Map<string, KevTranslateResult>();
  if (!llmEnabled() || entries.length === 0) return out;

  const chunks: KevTranslateInput[][] = [];
  for (let i = 0; i < entries.length; i += KEV_TRANSLATE_CHUNK) {
    chunks.push(entries.slice(i, i + KEV_TRANSLATE_CHUNK));
  }
  const results = await Promise.all(chunks.map((c) => translateKevChunk(c)));
  for (const m of results) for (const [k, v] of m) out.set(k, v);
  return out;
}

async function translateKevChunk(
  entries: KevTranslateInput[],
): Promise<Map<string, KevTranslateResult>> {
  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const out = new Map<string, KevTranslateResult>();

  const list = entries
    .map(
      (e, i) =>
        `#${i}\nNAME: ${(e.name || "").slice(0, 200)}\nDESC: ${(e.desc || "").slice(0, 400)}`,
    )
    .join("\n\n");

  const prompt = [
    "あなたはセキュリティ専門の翻訳者です。以下は CISA KEV（悪用が確認された脆弱性）の",
    "エントリです。それぞれ脆弱性名と説明を自然な日本語に翻訳してください。",
    "",
    "出力は **JSON 配列のみ**。コードフェンスや前置きは禁止。各要素:",
    `  {"index": <番号(整数)>, "nameJa": "<脆弱性名の日本語訳>", "descJa": "<説明の日本語訳(1〜2文)>"}`,
    "",
    "・製品名・ベンダ名・CVE 番号・プロトコル名は原文ママ。",
    "・「〜の脆弱性」のような自然なセキュリティ用語の言い回しにする。",
    "・DESC が空の場合 descJa は空文字でよい。index は必ず一致させること。",
    "",
    "---エントリ一覧---",
    list,
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
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.warn(`[kev-ja] Anthropic HTTP ${res.status}; body: ${body.slice(0, 200)}`);
      return out;
    }
    const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = (json.content ?? [])
      .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
      .join("\n")
      .trim();
    const parsed = extractJsonArray(text);
    if (!Array.isArray(parsed)) return out;
    for (const raw of parsed) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw as { index?: unknown; nameJa?: unknown; descJa?: unknown };
      if (typeof e.index !== "number" || !entries[e.index]) continue;
      const nameJa = typeof e.nameJa === "string" && e.nameJa.trim() ? e.nameJa.trim() : null;
      const descJa = typeof e.descJa === "string" && e.descJa.trim() ? e.descJa.trim() : null;
      // Don't cache a half-translation: a row with nameJa but no descJa (when
      // the source HAS a description) would freeze the description in English
      // forever (cache hits skip retranslation). Leave it untranslated so a
      // later budgeted call retries the whole entry.
      const srcHasDesc = !!(entries[e.index].desc || "").trim();
      if (srcHasDesc && !descJa) continue;
      if (nameJa || descJa) out.set(entries[e.index].id, { nameJa, descJa });
    }
    return out;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[kev-ja] error:", err);
    return out;
  } finally {
    clearTimeout(timer);
  }
}

export type WeeklyItem = {
  title: string;
  source: string;
  kind: string;
  tags: string[];
  whyJa: string | null;
  summaryJa: string | null;
  topSeverity: string | null;
};

// 週報: roll a week's worth of ingested articles into one labeled-section
// report. One LLM call; null on missing key / failure.
export async function summarizeWeekly(
  items: WeeklyItem[],
  weekRange: string,
): Promise<string | null> {
  if (!llmEnabled() || items.length === 0) return null;

  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const list = items
    .slice(0, 80)
    .map((it, i) => {
      const sev = it.topSeverity ? `(CVSS:${it.topSeverity})` : "";
      const gist = (it.whyJa || it.summaryJa || "").slice(0, 120);
      const tags = it.tags.length ? ` [${it.tags.join(",")}]` : "";
      return `#${i} [${it.source}/${it.kind}]${sev}${tags} ${it.title} — ${gist}`;
    })
    .join("\n");

  const prompt = [
    "あなたはセキュリティ編集長です。以下は今週（" + weekRange + "）に収集した記事一覧です。",
    "1週間を総括する『週報』を日本語で書いてください。",
    "次の見出しを行頭に【】付きで使い、各見出しの後に2〜4文（または短い箇条書き）:",
    "【今週の概況】週全体の傾向を俯瞰。",
    "【主要インシデント】今週最も影響の大きかった事案（複数媒体が報じたものを優先）。",
    "【悪用された脆弱性 (CVE)】悪用・要パッチの重要脆弱性。CVE番号は明記。無ければ「目立った新規悪用なし」。",
    "【AI動向】AI/LLM 関連の注目トピック。無ければ省略可。",
    "【来週への注目】読者（学生エンジニア）が来週ウォッチすべき点を1〜2点。",
    "",
    "制約: 誇張せず事実ベース。一覧にない事実は創作しない。前置き・後置き・",
    "コードフェンス禁止。全体で800字程度。",
    "",
    "---記事一覧---",
    list,
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
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.warn(`[weekly] Anthropic HTTP ${res.status}; body: ${body.slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    const out = (json.content ?? [])
      .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
      .join("\n")
      .trim();
    return out || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[weekly] error:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
