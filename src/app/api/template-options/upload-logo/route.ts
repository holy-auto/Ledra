import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerFull } from "@/lib/api/auth";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";
import { getTemplateOptionStatus } from "@/lib/template-options/templateOptionFeatures";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
// NOTE: SVG removed — SVG files can contain embedded scripts (XSS risk)
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Validate file magic bytes against allowed image types */
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
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** POST: テンプレート用ロゴアップロード */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();

    const optionStatus = await getTemplateOptionStatus(caller.tenantId);
    if (!optionStatus.hasSubscription) {
      return apiForbidden("テンプレートオプションの契約が必要です。");
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const configId = formData.get("config_id") as string | null;

    if (!file) {
      return apiValidationError("ファイルが選択されていません。");
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return apiValidationError("PNG, JPEG, WebP 形式のみアップロードできます。");
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiValidationError("ファイルサイズは2MB以下にしてください。");
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate magic bytes to prevent spoofed content types
    const detectedMime = validateMagicBytes(buffer);
    if (!detectedMime || !ALLOWED_TYPES.includes(detectedMime)) {
      return apiValidationError("ファイル形式が不正です。PNG, JPEG, WebP 形式のみアップロードできます。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const ext = detectedMime.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const storagePath = `template-logos/${caller.tenantId}/${Date.now()}.${ext}`;

    // Supabase Storage にアップロード
    const { error: uploadErr } = await admin.storage.from("assets").upload(storagePath, buffer, {
      contentType: detectedMime,
      upsert: true,
    });

    if (uploadErr) throw uploadErr;

    // template_assets に記録
    const { data: asset, error: assetErr } = await admin
      .from("template_assets")
      .insert({
        tenant_id: caller.tenantId,
        template_config_id: configId ?? null,
        asset_type: "logo",
        storage_path: storagePath,
        file_name: file.name,
        content_type: file.type,
        file_size: file.size,
      })
      .select("id")
      .single();

    if (assetErr) throw assetErr;

    // config_json の branding.logo_asset_id を更新
    if (configId) {
      const { data: config } = await admin
        .from("tenant_template_configs")
        .select("config_json")
        .eq("id", configId)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();

      if (config?.config_json) {
        const updatedConfig = {
          ...(config.config_json as Record<string, unknown>),
          branding: {
            ...(((config.config_json as Record<string, unknown>).branding as Record<string, unknown>) ?? {}),
            logo_asset_id: asset.id,
          },
        };

        await admin
          .from("tenant_template_configs")
          .update({ config_json: updatedConfig, updated_at: new Date().toISOString() })
          .eq("id", configId);
      }
    }

    return apiOk({
      asset_id: asset.id,
      storage_path: storagePath,
    });
  } catch (e) {
    return apiInternalError(e, "template-options/upload-logo");
  }
}
