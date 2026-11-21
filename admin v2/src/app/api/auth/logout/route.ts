import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, sessions } from "@/db";
import {
  clearSessionCookies,
  getAuthenticatedUser,
  hashSessionToken,
  getRawToken,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    let revokeAll = false;
    try {
      const body = await req.json();
      revokeAll = Boolean(body?.all);
    } catch {
      // empty body ok
    }

    const user = await getAuthenticatedUser();
    const rawToken = await getRawToken();

    if (revokeAll && user) {
      await db.delete(sessions).where(eq(sessions.userId, user.id));
    } else if (rawToken) {
      await db
        .delete(sessions)
        .where(eq(sessions.tokenHash, hashSessionToken(rawToken)));
    }

    await clearSessionCookies();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/logout error:", err);
    return NextResponse.json({ error: "Logout failed." }, { status: 500 });
  }
}
