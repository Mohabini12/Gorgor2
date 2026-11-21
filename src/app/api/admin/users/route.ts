import { NextRequest, NextResponse } from "next/server";
import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db, users } from "@/db";
import { generateId, hashPassword } from "@/lib/auth";
import { requireAdmin, FORBIDDEN } from "@/lib/admin";

const createSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  callsign: z.string().trim().max(24).optional(),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(128),
  rankRole: z.string().trim().max(60).optional(),
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json(FORBIDDEN, { status: 403 });
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      displayName: users.displayName,
      callsign: users.callsign,
      rankRole: users.rankRole,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
  return NextResponse.json({ users: rows, adminId: admin.id });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json(FORBIDDEN, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid fields." },
      { status: 400 }
    );
  }
  const username = parsed.data.username.toLowerCase();
  const email = parsed.data.email.toLowerCase();
  const dup = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.username, username), eq(users.email, email)))
    .limit(1);
  if (dup.length) {
    return NextResponse.json(
      { error: "Username or email already exists." },
      { status: 409 }
    );
  }
  const [created] = await db
    .insert(users)
    .values({
      id: generateId("usr"),
      username,
      email,
      displayName: parsed.data.displayName,
      callsign: (parsed.data.callsign || `GGR-${username.slice(0, 6)}`).toUpperCase(),
      rankRole: parsed.data.rankRole || "Field Operator",
      passwordHash: hashPassword(parsed.data.password),
    })
    .returning({ id: users.id });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
