import { NextResponse } from "next/server";
import { phoneLast4Hash } from "@/lib/customerPortalServer";
import { certificateCreateSchema } from "@/lib/validations/certificate";
import {
  apiJson,
  apiInternalError,
  apiValidationError,
  apiUnauthorized,
  apiForbidden,
  apiPlanLimit,
} from "@/lib/api/response";
import { enforceBilling } from "@/lib/billing/guard";
import { getCachedTenantBilling } from "@/lib/billing/tenantBillingCache";
import { CERT_LIMITS, normalizePlanTier } from "@/lib/billing/planFeatures";
import { logCertificateAction } from "@/lib/audit/certificateLog";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCertifiedTemplateForTenant } from "@/lib/manufacturers/certifiedTemplates";
import { issueCaptureNonce } from "@/lib/certificates/captureNonce";
import { storeIdOrNull } from "@/lib/stores/resolveStoreId";

export const dynamic = "force-dynamic";

async function supaInsertCertificate(tenantId: string, row: any) {
  const { admin } = createTenantScopedAdmin(tenantId);
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
  if (!requirePermission(caller, "certificates:create")) return apiForbidden();

  const deny = await enforceBilling(req, { minPlan: "free", action: "create", tenantId: caller.tenantId });
  if (deny) return deny;

  // ── 月間証明書発行上限チェック ──
  try {
    // plan_tier は billing guard (enforceBilling) と共有の 60 秒キャッシュから取得
    // (直前の enforceBilling で温まっているため通常はキャッシュヒット)。
    const billing = await getCachedTenantBilling(caller.tenantId);
    const planTier = normalizePlanTier(billing?.plan_tier ?? null);
    const certLimit = CERT_LIMITS[planTier];
    if (certLimit !== null) {
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count: monthlyCount } = await admin
        .from("certificates")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", caller.tenantId)
        .gte("created_at", startOfMonth);
      if ((monthlyCount ?? 0) >= certLimit) {
        return apiPlanLimit(`月間発行上限（${certLimit}件）に達しました。プランをアップグレードしてください。`, {
          limit: certLimit,
          current: monthlyCount,
          plan: planTier,
        });
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
    const customer_phone_last4_hash = customer_phone_last4 ? phoneLast4Hash(b.tenant_id, customer_phone_last4) : null;

    // メーカー指定デザインを使う場合は、このテナントが当該メーカーの
    // 認定施工店であることを application 側で必ず再確認する。RLS は
    // manufacturer_templates の閲覧までしか縛れないため、ここを抜くと
    // クライアントから任意の template_id を差し込まれて偽装発行される。
    let manufacturerId: string | null = null;
    let manufacturerTemplateId: string | null = null;
    if (b.manufacturer_template_id) {
      const resolved = await resolveCertifiedTemplateForTenant(caller.tenantId, b.manufacturer_template_id);
      if (!resolved) {
        return apiForbidden("このメーカーの認定施工店ではないため、指定デザインで発行できません。");
      }
      manufacturerId = resolved.manufacturer.id;
      manufacturerTemplateId = resolved.template.id;
    }

    // 写真添付必須ルール: 新規作成時点では写真が 0 枚のため active で作れない。
    // active を要求されても draft で作成し、写真アップロード後に
    // PUT /api/admin/certificates/status で発行 (active 化) させる。
    const insertRow = {
      tenant_id: caller.tenantId,
      // この経路は createCertificate を通らないので、店舗もここで決める
      store_id: await storeIdOrNull(
        createTenantScopedAdmin(caller.tenantId).admin,
        caller.tenantId,
        "certificates/create",
      ),
      status: "draft" as const,
      customer_name: b.customer_name,

      // 平文 (customer_phone_last4) は保存しない。検索・紐付けはハッシュ一本化。
      customer_phone_last4_hash,

      vehicle_info_json: b.vehicle_info_json ?? {},
      content_free_text: b.content_free_text ?? null,
      content_preset_json: b.content_preset_json ?? {},
      expiry_type: b.expiry_type ?? null,
      expiry_value: b.expiry_value ?? null,
      logo_asset_path: b.logo_asset_path ?? null,
      footer_variant: b.footer_variant ?? "holy",
      manufacturer_id: manufacturerId,
      manufacturer_template_id: manufacturerTemplateId,
    };

    const certificate = await supaInsertCertificate(caller.tenantId, insertRow);

    // 撮影時来歴の単回nonceをサーバ発行し、レスポンスで返す（撮影クライアントが
    // 写真アップロード時に添付し、cert 束縛の「新鮮な撮影」を証明する）。発行失敗は
    // cert 作成を止めない（null のまま = そのテナントは当面 basic 止まり）。
    const captureNonce = certificate?.id
      ? await issueCaptureNonce({ tenantId: caller.tenantId, certificateId: certificate.id })
      : null;

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

    return apiJson({ certificate, capture_nonce: captureNonce }, { status: 200 });
  } catch (e) {
    return apiInternalError(e, "certificates/create");
  }
}
