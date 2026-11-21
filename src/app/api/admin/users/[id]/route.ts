import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, users } from "@/db";
import { hashPassword } from "@/lib/auth";
import { requireAdmin, FORBIDDEN } from "@/lib/admin";

const patchSchema = z.object({
  password: z.string().min(8).max(128).optional(),
  displayName: z.string().trim().min(2).max(80).optional(),
  callsign: z.string().trim().min(1).max(24).optional(),
  rankRole: z.string().trim().min(1).max(60).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json(FORBIDDEN, { status: 403 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid fields." },
      { status: 400 }
    );
  }
  const { password, callsign, ...rest } = parsed.data;
  const set: Record<string, unknown> = { ...rest };
  if (callsign) set.callsign = callsign.toUpperCase();
  if (password) set.passwordHash = hashPassword(password);
  if (Object.keys(set).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  await db.update(users).set(set).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json(FORBIDDEN, { status: 403 });
  const { id } = await params;
  if (id === admin.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }
  await db.delete(users).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}
