// Slack notification. Posts a compact morning-digest summary to an Incoming
// Webhook when the digest is (re)generated. Zero dependency — just fetch.
//
// Graceful: if SLACK_WEBHOOK_URL is unset, this is a no-op. Failures are
// logged but never break the API response.

import type { CvssSeverity, Digest, DigestItem } from "./types";
import { topSeverity } from "./cve";

export function notifyEnabled(): boolean {
  return !!process.env.SLACK_WEBHOOK_URL;
}

const SEV_RANK: Record<CvssSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  NONE: 4,
};

// Optional SLACK_MIN_SEVERITY ("CRITICAL"|"HIGH"|"MEDIUM"|"LOW"). When set, the
// post only lists items whose top CVE meets that bar — "重大のみ通知". Returns
// null when unset (= notify everything).
function minSeverity(): CvssSeverity | null {
  const v = process.env.SLACK_MIN_SEVERITY?.trim().toUpperCase();
  if (v && v in SEV_RANK) return v as CvssSeverity;
  return null;
}

function meetsSeverity(it: DigestItem, min: CvssSeverity): boolean {
  const s = topSeverity(it.cves ?? []);
  return s != null && SEV_RANK[s] <= SEV_RANK[min];
}

// Public base URL for article links in the message.
function siteUrl(): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  // Vercel exposes these automatically at runtime.
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

// Slack mrkdwn only needs &, <, > escaped.
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const KIND_LABEL: Record<string, string> = {
  paper: "論文",
  research: "研究",
  ai: "AI",
};

export async function notifySlack(digest: Digest): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url) return false;

  const base = siteUrl();

  // "重大のみ通知": when SLACK_MIN_SEVERITY is set, only notify if there are
  // items at/above that severity, and list just those. No qualifying items
  // → skip the post entirely (don't spam an all-clear every run).
  const min = minSeverity();
  let pool = digest.items;
  if (min) {
    pool = digest.items.filter((it) => meetsSeverity(it, min));
    if (pool.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`[notify] no items >= ${min}; skipping Slack post`);
      return false;
    }
  }
  const top = pool.slice(0, 6);

  const SEV_EMOJI: Record<CvssSeverity, string> = {
    CRITICAL: "🔴",
    HIGH: "🟠",
    MEDIUM: "🟡",
    LOW: "⚪",
    NONE: "",
  };
  const lines = top.map((it, i) => {
    const why = it.whyJa ? `  — ${esc(it.whyJa)}` : "";
    const badge = KIND_LABEL[it.kind] ? `［${KIND_LABEL[it.kind]}］` : "";
    const sev = topSeverity(it.cves ?? []);
    const sevTag = sev && SEV_EMOJI[sev] ? `${SEV_EMOJI[sev]} ` : "";
    return `${i + 1}. ${sevTag}<${base}/article/${it.id}|${esc(it.title)}>  _${esc(
      it.source,
    )}_${badge ? ` ${badge}` : ""}${why}`;
  });

  const failed =
    digest.failedSources.length > 0
      ? ` · 取得失敗: ${digest.failedSources.join(", ")}`
      : "";

  const editionLabel = digest.edition === "morning" ? "🌅 朝刊" : "🌙 夕刊";
  const tldrBlock = digest.tldr
    ? [
        {
          type: "section",
          text: { type: "mrkdwn", text: `*今日の3行*\n${esc(digest.tldr)}` },
        },
        { type: "divider" },
      ]
    : [];

  const payload = {
    // Plain fallback text used for the OS/notification preview.
    text: `🛡️ Security Morning Digest ${digest.date} ${editionLabel}（${digest.items.length}件）`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🛡️ Security Morning Digest — ${digest.date} ${editionLabel}`,
          emoji: true,
        },
      },
      ...tldrBlock,
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: lines.join("\n") || "本日の記事はありません。",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${digest.items.length}件 · LLM:${
              digest.llmEnabled ? "有効" : "無効"
            }${failed} · <${base}/|サイトを開く> · <${base}/archive|アーカイブ>`,
          },
        ],
      },
    ],
  };

  return postSlack(url, payload);
}

async function postSlack(url: string, payload: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.warn(`[notify] Slack HTTP ${res.status}: ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[notify] error:", err);
    return false;
  }
}

// ---------------- KEV alert (悪用が確認された脆弱性の新規追加) ----------------

export type KevAlertEntry = {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  knownRansomware: boolean;
  // Japanese translation (cache-backed); null falls back to the English name.
  nameJa?: string | null;
  descJa?: string | null;
};

export async function notifyKevAlerts(
  entries: KevAlertEntry[],
  cvss: Map<string, { score: number | null }>,
): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url || entries.length === 0) return false;

  const base = siteUrl();
  // Ransomware-flagged entries first — they're the ones to drop everything for.
  const sorted = [...entries].sort(
    (a, b) => Number(b.knownRansomware) - Number(a.knownRansomware),
  );
  const shown = sorted.slice(0, 6);
  const extra = sorted.length - shown.length;

  const lines = shown.map((e) => {
    const mark = e.knownRansomware ? "🦠" : "⚠️";
    const score = cvss.get(e.cveID)?.score;
    const scoreTxt = score != null ? ` (CVSS ${score.toFixed(1)})` : "";
    const name = e.nameJa || e.vulnerabilityName;
    const head = `${mark} <https://nvd.nist.gov/vuln/detail/${e.cveID}|${e.cveID}>${scoreTxt} ${esc(
      e.vendorProject,
    )} / ${esc(e.product)} — ${esc(name)}`;
    // One-line Japanese description under the heading, when we have it.
    return e.descJa ? `${head}\n　${esc(e.descJa.slice(0, 200))}` : head;
  });

  // Slack section text caps at 3000 chars and a 400 drops the WHOLE payload —
  // and this alert is fire-once (ids are already marked seen). Keep whole
  // lines until ~2700 and fold the rest into the "+N" counter.
  const kept: string[] = [];
  let total = 0;
  let droppedLines = 0;
  for (const l of lines) {
    if (total + l.length + 1 > 2700) {
      droppedLines++;
      continue;
    }
    kept.push(l);
    total += l.length + 1;
  }

  const payload = {
    text: `🚨 KEV 新規追加 ${entries.length}件 — 悪用が確認された脆弱性`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🚨 KEV 新規追加 — 悪用が確認された脆弱性（${entries.length}件）`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            kept.join("\n") +
            (extra + droppedLines > 0 ? `\n…ほか ${extra + droppedLines} 件` : ""),
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `出典: CISA KEV · 🦠=ランサム悪用 · <${base}/cve|CVE特集を開く>`,
          },
        ],
      },
    ],
  };
  return postSlack(url, payload);
}

// ---------------- keyword watch alert ----------------

export async function notifyKeywordMatches(
  matches: Array<{
    item: { id: string; source: string; title: string; summaryJa: string | null };
    keywords: string[];
  }>,
): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url || matches.length === 0) return false;
  const base = siteUrl();

  const lines = matches.slice(0, 10).map((m) => {
    const kw = m.keywords.map((k) => `\`${esc(k)}\``).join(" ");
    return `• ${kw} <${base}/article/${m.item.id}|${esc(m.item.title)}> _${esc(m.item.source)}_`;
  });

  const payload = {
    text: `🔎 ウォッチ中のキーワードに一致（${matches.length}件）`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🔎 ウォッチ一致（${matches.length}件）`,
          emoji: true,
        },
      },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `WATCH_KEYWORDS · <${base}/|ダイジェストを開く>` }],
      },
    ],
  };
  return postSlack(url, payload);
}

// ---------------- weekly report (週報) ----------------

export async function notifyWeekly(
  report: string,
  weekRange: string,
): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url || !report.trim()) return false;

  const base = siteUrl();
  const payload = {
    text: `📅 週報 ${weekRange}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `📅 今週のセキュリティ週報 — ${weekRange}`, emoji: true },
      },
      {
        type: "section",
        // Slack section text caps at 3000 chars; our report is ~800 JP chars.
        text: { type: "mrkdwn", text: esc(report).slice(0, 2900) },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${base}/weekly|過去の週報> · <${base}/|今日のダイジェスト>` },
        ],
      },
    ],
  };
  return postSlack(url, payload);
}
