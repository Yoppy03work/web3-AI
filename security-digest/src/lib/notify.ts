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
