import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { enforceBilling } from "@/lib/billing/guard";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";

const certDuplicateSchema = z.object({
  source_public_id: z.string().trim().min(1, "source_public_id は必須です。").max(128),
});

export const dynamic = "force-dynamic";

// ─── POST: 証明書の複製（下書きとして新規作成） ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const deny = await enforceBilling(req, { minPlan: "free", action: "create", tenantId: caller.tenantId });
    if (deny) return deny;

    const parsed = certDuplicateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { source_public_id: sourcePublicId } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // ── 元の証明書を取得 ──
    const { data: source, error: fetchErr } = await admin
      .from("certificates")
      .select(
        "vehicle_id, vehicle_info_json, customer_name, customer_id, customer_phone_last4, customer_phone_last4_hash, content_free_text, content_preset_json, service_type, service_price, coating_products_json, expiry_type, expiry_value, logo_asset_path, footer_variant, template_id",
      )
      .eq("public_id", sourcePublicId)
      .eq("tenant_id", caller.tenantId)
      .limit(1)
      .maybeSingle();

    if (fetchErr || !source) {
      return apiNotFound("コピー元の証明書が見つかりません。");
    }

    // ── 複製データの組み立て（コピーしないフィールドを除外） ──
    const insertRow: Record<string, unknown> = {
      tenant_id: caller.tenantId,
      status: "draft",
      // 車両情報
      vehicle_id: source.vehicle_id ?? null,
      vehicle_info_json: source.vehicle_info_json ?? {},
      // 顧客情報
      customer_name: source.customer_name ?? null,
      customer_id: source.customer_id ?? null,
      customer_phone_last4: source.customer_phone_last4 ?? null,
      customer_phone_last4_hash: source.customer_phone_last4_hash ?? null,
      // テンプレート・コンテンツ
      content_free_text: source.content_free_text ?? null,
      content_preset_json: source.content_preset_json ?? {},
      // サービス情報
      service_type: source.service_type ?? null,
      service_price: source.service_price ?? null,
      coating_products_json: source.coating_products_json ?? null,
      // 表示設定
      expiry_type: source.expiry_type ?? null,
      expiry_value: source.expiry_value ?? null,
      logo_asset_path: source.logo_asset_path ?? null,
      footer_variant: source.footer_variant ?? "holy",
      template_id: source.template_id ?? null,
    };

    // ── 挿入（public_id は DB のデフォルトで自動生成） ──
    const { data: newCert, error: insertErr } = await admin
      .from("certificates")
      .insert(insertRow)
      .select("public_id")
      .single();

    if (insertErr) {
      console.error("[certificates/duplicate] insert_failed:", insertErr.message);
      return apiInternalError(insertErr, "certificates/duplicate");
    }

    return apiJson({
      ok: true,
      public_id: newCert.public_id,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "certificates/duplicate");
  }
}
