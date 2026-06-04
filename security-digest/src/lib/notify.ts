// Slack notification. Posts a compact morning-digest summary to an Incoming
// Webhook when the digest is (re)generated. Zero dependency — just fetch.
//
// Graceful: if SLACK_WEBHOOK_URL is unset, this is a no-op. Failures are
// logged but never break the API response.

import type { Digest } from "./types";

export function notifyEnabled(): boolean {
  return !!process.env.SLACK_WEBHOOK_URL;
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
  const top = digest.items.slice(0, 6);

  const lines = top.map((it, i) => {
    const why = it.whyJa ? `  — ${esc(it.whyJa)}` : "";
    const badge = KIND_LABEL[it.kind] ? `［${KIND_LABEL[it.kind]}］` : "";
    return `${i + 1}. <${base}/article/${it.id}|${esc(it.title)}>  _${esc(
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
