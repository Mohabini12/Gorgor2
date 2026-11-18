import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, messages } from "@/db";
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
    const [msg] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);
    if (!msg) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (msg.senderId !== me.id) {
      return NextResponse.json(
        { error: "You can only delete your own messages." },
        { status: 403 }
      );
    }

    await db
      .update(messages)
      .set({ deletedAt: new Date() })
      .where(eq(messages.id, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/messages/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete message." },
      { status: 500 }
    );
  }
}
