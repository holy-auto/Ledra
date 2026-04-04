import { NextResponse } from "next/server";
import { phoneLast4Hash } from "@/lib/customerPortalServer";
import { certificateCreateSchema } from "@/lib/validations/certificate";
import { apiInternalError, apiValidationError, apiUnauthorized, apiForbidden, apiPlanLimit } from "@/lib/api/response";
import { enforceBilling } from "@/lib/billing/guard";
import { CERT_LIMITS, normalizePlanTier } from "@/lib/billing/planFeatures";
import { logCertificateAction } from "@/lib/audit/certificateLog";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function supaInsertCertificate(row: any) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("certificates")
    .insert(row)
    .select("id, public_id, vehicle_id, tenant_id, status, created_at, updated_at")
    .single();

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  return data;
}

export async function POST(req: Request) {
  // ── 認証チェック: ログイン済みユーザーのテナントを検証 ──
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) {
    return apiUnauthorized();
  }

  const deny = await enforceBilling(req, { minPlan: "free", action: "create", tenantId: caller.tenantId });
  if (deny) return deny as any;

  // ── 月間証明書発行上限チェック ──
  try {
    const admin = getSupabaseAdmin();
    const { data: tenant } = await admin
      .from("tenants")
      .select("plan_tier")
      .eq("id", caller.tenantId)
      .limit(1)
      .maybeSingle();
    const planTier = normalizePlanTier(tenant?.plan_tier);
    const certLimit = CERT_LIMITS[planTier];
    if (certLimit !== null) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count: monthlyCount } = await admin
        .from("certificates")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", caller.tenantId)
        .gte("created_at", startOfMonth);
      if ((monthlyCount ?? 0) >= certLimit) {
        return apiPlanLimit(
          `月間発行上限（${certLimit}件）に達しました。プランをアップグレードしてください。`,
          { limit: certLimit, current: monthlyCount, plan: planTier },
        );
      }
    }
  } catch (e) {
    console.error("[certificates/create] cert limit check failed:", e);
    // 制限チェック失敗時は安全側でブロックしない（発行を優先）
  }

  try {
    const body = await req.json();
    const parsed = certificateCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。");
    }
    const b = parsed.data;

    // ── tenant_id照合: リクエストのtenant_idと認証ユーザーのテナントが一致するか検証 ──
    if (b.tenant_id !== caller.tenantId) {
      return apiForbidden("テナントIDが一致しません。");
    }

    const customer_phone_last4 = b.customer_phone_last4 ?? null;
    const customer_phone_last4_hash =
      customer_phone_last4 ? phoneLast4Hash(b.tenant_id, customer_phone_last4) : null;

    const insertRow = {
      tenant_id: caller.tenantId,
      status: b.status ?? "active",
      customer_name: b.customer_name,

      // 新規からはここを正しく保存
      customer_phone_last4,
      customer_phone_last4_hash,

      vehicle_info_json: b.vehicle_info_json ?? {},
      content_free_text: b.content_free_text ?? null,
      content_preset_json: b.content_preset_json ?? {},
      expiry_type: b.expiry_type ?? null,
      expiry_value: b.expiry_value ?? null,
      logo_asset_path: b.logo_asset_path ?? null,
      footer_variant: b.footer_variant ?? "holy",
    };

    const certificate = await supaInsertCertificate(insertRow);

    // Fire-and-forget audit log
    logCertificateAction({
      type: "certificate_issued",
      tenantId: caller.tenantId,
      publicId: certificate?.public_id ?? "",
      certificateId: certificate?.id ?? null,
      vehicleId: certificate?.vehicle_id ?? null,
      userId: caller.userId,
      description: `顧客: ${b.customer_name}`,
    });

    return NextResponse.json({ certificate }, { status: 200 });
  } catch (e) {
    return apiInternalError(e, "certificates/create");
  }
}
