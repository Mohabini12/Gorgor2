import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, sessions } from "@/db";
import { requireAdmin, FORBIDDEN } from "@/lib/admin";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json(FORBIDDEN, { status: 403 });
  const { id } = await params;
  await db.delete(sessions).where(eq(sessions.userId, id));
  return NextResponse.json({ ok: true });
}
