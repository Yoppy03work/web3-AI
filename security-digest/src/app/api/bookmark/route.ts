import { setBookmark } from "@/lib/db";

export const dynamic = "force-dynamic";

// Toggle a bookmark. Single-user personal app — no auth on writes.
// POST { id: string, on: boolean }
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { id?: unknown; on?: unknown }
      | null;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const on = body?.on === true;
    if (!id) {
      return Response.json({ error: "missing id" }, { status: 400 });
    }
    await setBookmark(id, on);
    return Response.json(
      { ok: true, id, on },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/bookmark] error:", err);
    return Response.json(
      { error: "internal_error", message: String(err) },
      { status: 500 },
    );
  }
}
