import { NextRequest, NextResponse } from "next/server";
import { or, eq } from "drizzle-orm";
import { z } from "zod";
import { db, users } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  createSessionForUser,
  setSessionCookies,
  toCurrentUser,
  verifyPassword,
} from "@/lib/auth";

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(128),
});

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please provide a valid username/email and password." },
        { status: 400 }
      );
    }

    const idLower = parsed.data.identifier.toLowerCase();
    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.username, idLower), eq(users.email, idLower)))
      .limit(1);

    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return NextResponse.json(
        { error: "Invalid username/email or password." },
        { status: 401 }
      );
    }

    const now = new Date();
    await db
      .update(users)
      .set({ lastSeenAt: now })
      .where(eq(users.id, user.id));
    user.lastSeenAt = now;

    const ua = req.headers.get("user-agent") ?? "";
    const { token, expiresAt } = await createSessionForUser(user.id, ua);
    await setSessionCookies(token, expiresAt);

    return NextResponse.json({ user: toCurrentUser(user), token });
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    return NextResponse.json(
      { error: "Authentication failed." },
      { status: 500 }
    );
  }
}
