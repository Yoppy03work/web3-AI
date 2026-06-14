import { setBookmark } from "@/lib/db";

export const dynamic = "force-dynamic";

// Toggle a bookmark. Single-user personal app — no auth on writes, but the id
// is validated against the article-id shape (10 hex, see lib/id.ts) so this
// open endpoint can't be used to insert arbitrary/oversized rows and fill the
// (free-tier) DB. Unknown-but-valid ids just inner-join to nothing on display.
const ID_RE = /^[0-9a-f]{10}$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { id?: unknown; on?: unknown }
      | null;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const on = body?.on === true;
    if (!ID_RE.test(id)) {
      return Response.json({ error: "invalid id" }, { status: 400 });
    }
    await setBookmark(id, on);
    return Response.json(
      { ok: true, id, on },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/bookmark] error:", err);
    // Don't leak internal error details (SQL/host) to clients.
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
