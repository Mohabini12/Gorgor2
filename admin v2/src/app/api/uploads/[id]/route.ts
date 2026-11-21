import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { db, attachments, messages, groupMembers } from "@/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { UPLOAD_DIR } from "../route";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id } = await context.params;
    const [att] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id))
      .limit(1);

    if (!att) {
      return new NextResponse("Attachment not found", { status: 404 });
    }

    // Verify user has permission to access this attachment
    let authorized = att.uploaderId === me.id;
    if (!authorized && att.messageId) {
      const [msg] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, att.messageId))
        .limit(1);

      if (msg && !msg.deletedAt) {
        if (msg.senderId === me.id || msg.recipientId === me.id) {
          authorized = true;
        } else if (msg.groupId) {
          const [member] = await db
            .select()
            .from(groupMembers)
            .where(
              and(
                eq(groupMembers.groupId, msg.groupId),
                eq(groupMembers.userId, me.id)
              )
            )
            .limit(1);
          authorized = Boolean(member);
        }
      }
    }

    if (!authorized) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const safeStored = path.basename(att.storedName);
    const fullPath = path.join(UPLOAD_DIR, safeStored);
    const bytes = await fs.readFile(fullPath);

    const forceDownload = req.nextUrl.searchParams.get("download") === "1";
    const disposition =
      att.category === "image" && !forceDownload
        ? `inline; filename="${att.fileName.replace(/"/g, "")}"`
        : att.mimeType === "application/pdf" && !forceDownload
        ? `inline; filename="${att.fileName.replace(/"/g, "")}"`
        : `attachment; filename="${att.fileName.replace(/"/g, "")}"`;

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": att.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": disposition,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("GET /api/uploads/[id] error:", err);
    return new NextResponse("Attachment unavailable", { status: 404 });
  }
}
