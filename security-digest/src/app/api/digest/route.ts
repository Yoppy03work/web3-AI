import { getDigest } from "@/lib/digest";
import { checkKevAlerts } from "@/lib/kevAlert";
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

    // On a real refresh (this is what the cron hits), push a Slack summary.
    // Await it so the serverless function doesn't freeze before the POST
    // completes. Opt out with &notify=0 while testing manually.
    if (refresh && url.searchParams.get("notify") !== "0") {
      await notifySlack(digest);

      // KEV速報: alert on newly-listed actively-exploited CVEs (diff per run;
      // the first run seeds silently).
      await checkKevAlerts().catch(() => {});

      // 週報: piggyback on the evening cron — actually generates only on
      // Sundays (JST) and is idempotent per week. `?weekly=1` forces (testing).
      const weeklyForce = url.searchParams.get("weekly") === "1";
      if (weeklyForce || digest.edition === "evening") {
        await maybeGenerateWeekly(weeklyForce).catch(() => {});
      }
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
    return new Response(
      JSON.stringify({ error: "internal_error", message: String(err) }),
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
