import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { DEFAULT_OPERATOR_ID, ensureSeeded } from "@/db/seed";
import {
  createSessionForUser,
  getAuthenticatedUser,
  setSessionCookies,
  SIGNED_OUT_COOKIE,
  toCurrentUser,
} from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const existing = await getAuthenticatedUser();
    if (existing) {
      return NextResponse.json({ user: toCurrentUser(existing) });
    }

    const store = await cookies();
    const signedOut =
      store.get(SIGNED_OUT_COOKIE)?.value === "1" ||
      req.headers.get("x-signed-out") === "1";
    if (signedOut) {
      return NextResponse.json({ user: null });
    }

    // Bootstrap first-run operator session backed by PostgreSQL
    const [defaultUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, DEFAULT_OPERATOR_ID))
      .limit(1);

    if (!defaultUser) {
      return NextResponse.json({ user: null });
    }

    const ua = req.headers.get("user-agent") ?? "";
    const { token, expiresAt } = await createSessionForUser(defaultUser.id, ua);
    await setSessionCookies(token, expiresAt);

    return NextResponse.json({ user: toCurrentUser(defaultUser), token });
  } catch (err) {
    console.error("GET /api/auth/me error:", err);
    return NextResponse.json(
      { error: "Failed to load account session." },
      { status: 500 }
    );
  }
}
