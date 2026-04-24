import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiJson, apiValidationError, apiInternalError, applySecurityHeaders } from "@/lib/api/response";
import crypto from "crypto";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/** Validate file magic bytes against allowed types */
function validateMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  // PDF: 25 50 44 46 (%PDF)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return "application/pdf";
  }
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
    return applySecurityHeaders(
      apiJson(
        { error: "rate_limited", message: "アップロード回数の上限に達しました。しばらくしてから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      ),
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return apiValidationError("invalid form data");
  }

  const files = formData.getAll("files") as File[];
  if (files.length === 0) return apiValidationError("ファイルが選択されていません");
  if (files.length > MAX_FILES) return apiValidationError(`ファイルは${MAX_FILES}個まで添付できます`);

  const supabase = createServiceRoleAdmin("agent apply flow — pre-tenant registration");
  const uploaded: { name: string; storage_path: string; content_type: string; file_size: number }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (!ALLOWED_TYPES.includes(file.type)) {
      return apiValidationError(`${file.name}: PDF、JPEG、PNGのみ対応しています`);
    }
    if (file.size > MAX_FILE_SIZE) {
      return apiValidationError(`${file.name}: ファイルサイズは10MB以下にしてください`);
    }

    const buf = Buffer.from(await file.arrayBuffer());

    // Validate magic bytes to prevent spoofed content types
    const detectedMime = validateMagicBytes(buf);
    if (!detectedMime || !ALLOWED_TYPES.includes(detectedMime)) {
      return apiValidationError(`${file.name}: ファイル形式が不正です。PDF、JPEG、PNGのみ対応しています`);
    }

    const ext = detectedMime === "application/pdf" ? "pdf" : detectedMime === "image/png" ? "png" : "jpg";
    const uniqueId = crypto.randomBytes(8).toString("hex");
    const storagePath = `pending/${Date.now()}_${uniqueId}_${i}.${ext}`;

    const { error } = await supabase.storage
      .from("agent-applications")
      .upload(storagePath, buf, { contentType: detectedMime, upsert: false });

    if (error) return apiInternalError(error, "agent/apply/upload storage");

    uploaded.push({
      name: file.name,
      storage_path: storagePath,
      content_type: detectedMime,
      file_size: file.size,
    });
  }

  return apiJson({ files: uploaded });
}
