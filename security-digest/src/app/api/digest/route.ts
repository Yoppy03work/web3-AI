import { getDigest } from "@/lib/digest";

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
