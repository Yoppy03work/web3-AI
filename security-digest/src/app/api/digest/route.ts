import { after } from "next/server";
import { getDigest } from "@/lib/digest";
import { checkKevAlerts } from "@/lib/kevAlert";
import { prewarmKevJa } from "@/lib/kevJa";
import { notifySlack } from "@/lib/notify";
import { maybeGenerateWeekly } from "@/lib/weekly";

export const dynamic = "force-dynamic";
// A refresh fans out feeds + several LLM calls (summary chunks w/ retry, TL;DR,
// report). Give it headroom beyond the default function timeout.
export const maxDuration = 60;

// Authorize a forced refresh. A forced refresh is expensive (feed fan-out +
// paid Anthropic call + Slack post), so we don't want it open to the world.
//   - Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when
//     CRON_SECRET is set → that always passes (the morning cron path).
//   - Manual callers pass `?token=$REFRESH_TOKEN`.
//   - If a secret IS configured, callers without valid creds are rejected.
//   - If NEITHER is configured, refresh stays open (dev / personal default).
function refreshAuthorized(request: Request, url: URL): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const token = process.env.REFRESH_TOKEN?.trim();

  if (cronSecret) {
    const auth = request.headers.get("authorization") || "";
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  if (token) {
    return url.searchParams.get("token") === token;
  }
  // No REFRESH_TOKEN: if a CRON_SECRET is set, lock manual callers out
  // (only the cron Bearer above is allowed); otherwise leave it open.
  return !cronSecret;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const refresh = url.searchParams.get("refresh") === "1";

    if (refresh && !refreshAuthorized(request, url)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    const digest = await getDigest(refresh);

    // Post-refresh side work (Slack digest, KEV alert diff, weekly report)
    // runs via after() so the response isn't held open — the digest build
    // alone can take ~40s and adding these inline once tripped the 60s
    // function cap (504). after() keeps the function alive past the response.
    // Opt out with &notify=0 while testing manually.
    if (refresh && url.searchParams.get("notify") !== "0") {
      const weeklyForce = url.searchParams.get("weekly") === "1";
      after(async () => {
        // 週報 first (Sundays / forced; idempotent per week) — it's the one
        // that must not get starved if the budget runs short.
        if (weeklyForce || digest.edition === "evening") {
          await maybeGenerateWeekly(weeklyForce).catch(() => {});
        }
        await notifySlack(digest).catch(() => {});
        // KEV速報: newly-listed actively-exploited CVEs (windowed diff;
        // first run / bulk states absorb silently).
        await checkKevAlerts().catch(() => {});
        // Pre-translate the /cve page's visible window so views are cache-hits.
        await prewarmKevJa().catch(() => {});
      });
    }

    return new Response(JSON.stringify(digest), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/digest] error:", err);
    // Keep details in the server log only; don't leak internals to clients.
    return new Response(
      JSON.stringify({ error: "internal_error" }),
      {
        status: 500,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }
}
