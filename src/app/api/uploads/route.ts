import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { db, attachments } from "@/db";
import { generateId, getAuthenticatedUser } from "@/lib/auth";
import type { MessageAttachment } from "@/types/gorgor";

export const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_DOC_EXTS = new Set([
  ".pdf",
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".geojson",
  ".gpx",
  ".kml",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".zip",
]);

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function sanitizeFileName(raw: string): string {
  const base = path.basename(raw).replace(/[^\w.\- ()[\]]+/g, "_").trim();
  return base.slice(0, 120) || "attachment";
}

export async function POST(req: NextRequest) {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file received in upload." },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        { error: "Uploaded file is empty." },
        { status: 400 }
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "File exceeds maximum allowed size of 15 MB." },
        { status: 413 }
      );
    }

    const safeName = sanitizeFileName(file.name);
    const ext = path.extname(safeName).toLowerCase();
    const mime = (file.type || "application/octet-stream").toLowerCase();

    const isImage = IMAGE_MIMES.has(mime) || IMAGE_EXTS.has(ext);
    const isDoc = !isImage && ALLOWED_DOC_EXTS.has(ext);

    if (!isImage && !isDoc) {
      return NextResponse.json(
        {
          error:
            "Unsupported file type. Allowed: JPG, PNG, WebP, GIF, PDF, TXT, CSV, GPX, KML, GeoJSON, DOC/DOCX, XLS/XLSX, ZIP.",
        },
        { status: 400 }
      );
    }

    const safeMime = isImage
      ? IMAGE_MIMES.has(mime)
        ? mime
        : ext === ".png"
        ? "image/png"
        : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
        ? "image/gif"
        : "image/jpeg"
      : ext === ".pdf"
      ? "application/pdf"
      : ext === ".txt" || ext === ".md"
      ? "text/plain; charset=utf-8"
      : ext === ".csv"
      ? "text/csv; charset=utf-8"
      : ext === ".json" || ext === ".geojson"
      ? "application/json"
      : ext === ".gpx"
      ? "application/gpx+xml"
      : ext === ".kml"
      ? "application/vnd.google-earth.kml+xml"
      : mime || "application/octet-stream";

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const storedName = `${crypto.randomUUID()}${ext || ".bin"}`;
    const filePath = path.join(UPLOAD_DIR, storedName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    const id = generateId("att");
    const [created] = await db
      .insert(attachments)
      .values({
        id,
        messageId: null,
        uploaderId: me.id,
        fileName: safeName,
        storedName,
        mimeType: safeMime,
        fileSize: buffer.byteLength,
        category: isImage ? "image" : "document",
      })
      .returning();

    const response: MessageAttachment = {
      id: created.id,
      fileName: created.fileName,
      mimeType: created.mimeType,
      fileSize: created.fileSize,
      category: created.category as "image" | "document",
      url: `/api/uploads/${created.id}`,
      createdAt: created.createdAt.toISOString(),
    };

    return NextResponse.json({ attachment: response }, { status: 201 });
  } catch (err) {
    console.error("POST /api/uploads error:", err);
    return NextResponse.json(
      { error: "File upload failed." },
      { status: 500 }
    );
  }
}
