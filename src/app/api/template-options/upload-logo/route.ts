import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCallerFull } from "@/lib/api/auth";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";
import { getTemplateOptionStatus } from "@/lib/template-options/templateOptionFeatures";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

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
      return apiValidationError("PNG, JPEG, SVG, WebP 形式のみアップロードできます。");
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiValidationError("ファイルサイズは2MB以下にしてください。");
    }

    const admin = createAdminClient();
    const ext = file.name.split(".").pop() ?? "png";
    const storagePath = `template-logos/${caller.tenantId}/${Date.now()}.${ext}`;

    // Supabase Storage にアップロード
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadErr } = await admin.storage
      .from("assets")
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
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
            ...((config.config_json as Record<string, unknown>).branding as Record<string, unknown> ?? {}),
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
