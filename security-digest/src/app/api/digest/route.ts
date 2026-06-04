import { getDigest } from "@/lib/digest";
import { notifySlack } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const refresh = url.searchParams.get("refresh") === "1";
    const expected = process.env.REFRESH_TOKEN;

    if (refresh && expected) {
      const token = url.searchParams.get("token");
      if (token !== expected) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
    }

    const digest = await getDigest(refresh);

    // On a real refresh (this is what the cron hits), push a Slack summary.
    // Await it so the serverless function doesn't freeze before the POST
    // completes. Opt out with &notify=0 while testing manually.
    if (refresh && url.searchParams.get("notify") !== "0") {
      await notifySlack(digest);
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
