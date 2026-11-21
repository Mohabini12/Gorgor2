import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, waypoints } from "@/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;
    const [existing] = await db
      .select()
      .from(waypoints)
      .where(eq(waypoints.id, id))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (existing.userId !== me.id) {
      return NextResponse.json(
        { error: "Only the creator can delete this waypoint." },
        { status: 403 }
      );
    }
    await db.delete(waypoints).where(eq(waypoints.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/waypoints/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete waypoint." },
      { status: 500 }
    );
  }
}
