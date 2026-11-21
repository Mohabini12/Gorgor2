import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { loadBranding, saveBranding } from "@/lib/branding";

// Branding is read from and written to PostgreSQL per request.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const branding = await loadBranding();
    return new NextResponse(JSON.stringify(branding), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("GET /api/branding error:", err);
    return NextResponse.json(
      { error: "Failed to load branding." },
      { status: 500 }
    );
  }
}

const HEX = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, e.g. #CE2028");

const patchSchema = z.object({
  appName: z.string().trim().min(2).max(24).optional(),
  subtitleEn: z.string().trim().min(3).max(60).optional(),
  subtitleSo: z.string().trim().min(3).max(60).optional(),
  variant: z.enum(["seal", "mono"]).optional(),
  ringText: z.string().trim().min(3).max(90).optional(),
  gold: HEX.optional(),
  goldDeep: HEX.optional(),
  red: HEX.optional(),
  redDeep: HEX.optional(),
  ink: HEX.optional(),
  ringInk: HEX.optional(),
  plate: HEX.optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid branding configuration.",
        },
        { status: 400 }
      );
    }

    const branding = await saveBranding(parsed.data);
    return NextResponse.json({ branding });
  } catch (err) {
    console.error("PATCH /api/branding error:", err);
    return NextResponse.json(
      { error: "Failed to update branding." },
      { status: 500 }
    );
  }
}
