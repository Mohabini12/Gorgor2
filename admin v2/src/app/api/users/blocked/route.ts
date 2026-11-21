import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, blockedUsers, users } from "@/db";
import { generateId, getAuthenticatedUser, toPublicOperator } from "@/lib/auth";

export async function GET() {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await db
      .select({ user: users })
      .from(blockedUsers)
      .innerJoin(users, eq(blockedUsers.blockedId, users.id))
      .where(eq(blockedUsers.blockerId, me.id));

    return NextResponse.json({
      blocked: rows.map((r) => toPublicOperator(r.user, true)),
    });
  } catch (err) {
    console.error("GET /api/users/blocked error:", err);
    return NextResponse.json(
      { error: "Failed to load blocked accounts." },
      { status: 500 }
    );
  }
}

const blockSchema = z.object({
  userId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = blockSchema.safeParse(body);
    if (!parsed.success || parsed.data.userId === me.id) {
      return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
    }

    await db
      .insert(blockedUsers)
      .values({
        id: generateId("blk"),
        blockerId: me.id,
        blockedId: parsed.data.userId,
      })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/users/blocked error:", err);
    return NextResponse.json(
      { error: "Failed to block user." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "Missing userId." }, { status: 400 });
    }

    await db
      .delete(blockedUsers)
      .where(
        and(
          eq(blockedUsers.blockerId, me.id),
          eq(blockedUsers.blockedId, userId)
        )
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/users/blocked error:", err);
    return NextResponse.json(
      { error: "Failed to unblock user." },
      { status: 500 }
    );
  }
}
