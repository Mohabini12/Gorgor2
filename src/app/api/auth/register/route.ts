import { NextRequest, NextResponse } from "next/server";
import { or, eq } from "drizzle-orm";
import { z } from "zod";
import { db, users } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  createSessionForUser,
  generateId,
  hashPassword,
  setSessionCookies,
  toCurrentUser,
} from "@/lib/auth";

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username may only contain letters, numbers, _, ., -"),
  email: z.string().trim().email().max(120),
  displayName: z.string().trim().min(2).max(80),
  callsign: z.string().trim().min(2).max(24).optional(),
  rankRole: z.string().trim().min(2).max(60).optional(),
  preferredLanguage: z.enum(["en", "so"]).optional(),
  password: z.string().min(6).max(128),
});

const AVATAR_PALETTE = [
  "#2D8CFF",
  "#0EA5E9",
  "#2563EB",
  "#0284C7",
  "#1D4ED8",
  "#0369A1",
];

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid registration fields.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const username = parsed.data.username.toLowerCase();
    const email = parsed.data.email.toLowerCase();

    const existing = await db
      .select({ id: users.id, username: users.username, email: users.email })
      .from(users)
      .where(or(eq(users.username, username), eq(users.email, email)))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        {
          error:
            existing[0].username === username
              ? "That username is already registered."
              : "That email address is already registered.",
        },
        { status: 409 }
      );
    }

    const callsign = (
      parsed.data.callsign ||
      `GGR-${username.slice(0, 6)}`
    ).toUpperCase();

    const color =
      AVATAR_PALETTE[Math.floor(Math.random() * AVATAR_PALETTE.length)];

    const [created] = await db
      .insert(users)
      .values({
        id: generateId("usr"),
        username,
        email,
        displayName: parsed.data.displayName,
        callsign,
        rankRole: parsed.data.rankRole || "Field Operator",
        bio: "",
        avatarColor: color,
        passwordHash: hashPassword(parsed.data.password),
        preferredLanguage: parsed.data.preferredLanguage ?? "en",
        preferredCoordFormat: "MGRS",
      })
      .returning();

    const ua = req.headers.get("user-agent") ?? "";
    const { token, expiresAt } = await createSessionForUser(created.id, ua);
    await setSessionCookies(token, expiresAt);

    return NextResponse.json(
      { user: toCurrentUser(created), token },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/auth/register error:", err);
    return NextResponse.json(
      { error: "Account registration failed." },
      { status: 500 }
    );
  }
}
