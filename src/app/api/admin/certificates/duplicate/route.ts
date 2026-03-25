import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { getAdminClient } from "@/lib/api/auth";
import { enforceBilling } from "@/lib/billing/guard";
import { apiUnauthorized, apiForbidden, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── POST: 証明書の複製（下書きとして新規作成） ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const deny = await enforceBilling(req as any, { minPlan: "free", action: "create" });
    if (deny) return deny as any;

    const body = await req.json().catch(() => ({} as any));
    const sourcePublicId = (body?.source_public_id ?? "").trim();
    if (!sourcePublicId) {
      return apiValidationError("source_public_id は必須です。");
    }

    const admin = getAdminClient();

    // ── 元の証明書を取得 ──
    const { data: source, error: fetchErr } = await admin
      .from("certificates")
      .select("*")
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

    return NextResponse.json({
      ok: true,
      public_id: newCert.public_id,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "certificates/duplicate");
  }
}
