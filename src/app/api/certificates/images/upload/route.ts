import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient as createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages";
import { normalizePlanTier, PHOTO_LIMITS } from "@/lib/billing/planFeatures";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { apiError } from "@/lib/api/response";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file

/** Validate file magic bytes against allowed image types */
function validateMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return "image/png";
  }
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return "image/webp";
  }
  // HEIF/HEIC: check for 'ftyp' box at offset 4, then 'heic', 'heix', 'hevc', 'mif1'
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'mif1'].includes(brand)) {
      return "image/heic";
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // ── Rate limit: 20 uploads per user per minute ───────────────
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    // ── Auth (resolveCallerWithRole for proper tenant isolation) ──
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return apiUnauthorized();
    }
    const tenantId = caller.tenantId;

    // ── Plan tier → photo limit ───────────────────────────────────
    const { data: tenant } = await supabase
      .from("tenants")
      .select("plan_tier")
      .eq("id", tenantId)
      .single();
    const planTier = normalizePlanTier((tenant as any)?.plan_tier);
    const maxPhotos = PHOTO_LIMITS[planTier];

    // ── Parse multipart form ──────────────────────────────────────
    const form = await req.formData();
    const publicId = String(form.get("public_id") ?? "").trim();
    if (!publicId) {
      return apiValidationError("public_id は必須です。");
    }

    const files = form.getAll("photos") as File[];
    if (files.length === 0) {
      return apiOk({ uploaded: 0 });
    }

    // ── Verify certificate belongs to this tenant ─────────────────
    const admin = createSupabaseAdminClient();
    const { data: cert } = await admin
      .from("certificates")
      .select("id, tenant_id")
      .eq("public_id", publicId)
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    if (!cert?.id) {
      return apiNotFound("証明書が見つかりません。");
    }

    // ── Count existing images ─────────────────────────────────────
    const { count: existingCount } = await admin
      .from("certificate_images")
      .select("id", { count: "exact", head: true })
      .eq("certificate_id", cert.id);
    const existing = existingCount ?? 0;
    const remaining = maxPhotos - existing;

    if (remaining <= 0) {
      return apiError({
        code: "plan_limit",
        message: "写真の上限に達しました。",
        status: 422,
        data: { max: maxPhotos, plan: planTier },
      });
    }

    // ── Upload files ───────────────────────────────────────────────
    const toUpload = files.slice(0, remaining);
    let uploaded = 0;

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i];
      if (!file || !file.size) continue;

      // Validate size
      if (file.size > MAX_FILE_BYTES) continue;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Validate magic bytes (not client-provided MIME)
      const detectedMime = validateMagicBytes(buffer);
      if (!detectedMime) continue;

      const mime = detectedMime;
      const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const storagePath = `${tenantId}/${cert.id}/${Date.now()}_${i}.${ext}`;

      const { error: uploadError } = await admin.storage
        .from(CERTIFICATE_IMAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: mime,
          upsert: false,
        });

      if (uploadError) {
        console.error("storage upload error", uploadError);
        continue;
      }

      await admin.from("certificate_images").insert({
        certificate_id: cert.id,
        storage_path: storagePath,
        file_name: file.name || `photo_${i + 1}.${ext}`,
        content_type: mime,
        file_size: file.size,
        sort_order: existing + uploaded,
      });

      uploaded++;
    }

    return apiOk({ uploaded, max: maxPhotos, plan: planTier });
  } catch (e) {
    return apiInternalError(e, "image upload");
  }
}
