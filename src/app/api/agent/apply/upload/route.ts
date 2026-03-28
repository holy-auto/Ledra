import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import crypto from "crypto";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

function detectMimeFromBytes(buf: Uint8Array): string | null {
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return "image/png";
  return null;
}

/**
 * POST /api/agent/apply/upload
 * Upload documents for agent application (no auth required).
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`apply-upload:${ip}`, { limit: 10, windowSec: 600 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "アップロード回数の上限に達しました。しばらくしてから再度お試しください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const files = formData.getAll("files") as File[];
  if (files.length === 0) {
    return NextResponse.json({ error: "no_files", message: "ファイルが選択されていません" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: "too_many_files", message: `ファイルは${MAX_FILES}個まで添付できます` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const uploaded: { name: string; storage_path: string; content_type: string; file_size: number }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "file_too_large", message: `${file.name}: ファイルサイズは10MB以下にしてください` },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const detectedMime = detectMimeFromBytes(new Uint8Array(buf));
    if (!detectedMime || !ALLOWED_TYPES.includes(detectedMime)) {
      return NextResponse.json(
        { error: "invalid_type", message: `${file.name}: PDF、JPEG、PNGのみ対応しています` },
        { status: 400 },
      );
    }

    const ext = detectedMime === "application/pdf" ? "pdf" : detectedMime === "image/png" ? "png" : "jpg";
    const uniqueId = crypto.randomBytes(8).toString("hex");
    const storagePath = `pending/${Date.now()}_${uniqueId}_${i}.${ext}`;

    const { error } = await supabase.storage
      .from("agent-applications")
      .upload(storagePath, buf, { contentType: detectedMime, upsert: false });

    if (error) {
      console.error("[agent/apply/upload] storage error:", error.message);
      return NextResponse.json(
        { error: "upload_failed", message: "ファイルのアップロードに失敗しました" },
        { status: 500 },
      );
    }

    uploaded.push({
      name: file.name,
      storage_path: storagePath,
      content_type: detectedMime,
      file_size: file.size,
    });
  }

  return NextResponse.json({ files: uploaded });
}
