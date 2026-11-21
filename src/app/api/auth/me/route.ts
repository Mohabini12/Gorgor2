import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/db/seed";
import { getAuthenticatedUser, toCurrentUser } from "@/lib/auth";

export async function GET(_req: NextRequest) {
  try {
    await ensureSeeded();
    const existing = await getAuthenticatedUser();
    if (existing) {
      return NextResponse.json({ user: toCurrentUser(existing) });
    }

    // No session: require sign-in (no automatic default-operator login)
    return NextResponse.json({ user: null });
  } catch (err) {
    console.error("GET /api/auth/me error:", err);
    return NextResponse.json(
      { error: "Failed to load account session." },
      { status: 500 }
    );
  }
}
