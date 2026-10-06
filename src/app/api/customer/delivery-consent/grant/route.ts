/**
 * POST /api/customer/delivery-consent/grant — 使用者本人が「電子交付の承諾」をする。 [G3 / 第２ ４（３）]
 *
 * body { tenant_slug, consent_version }
 * 認証: 顧客ポータルセッション（customer_id 紐付きのみ。revoke と同じ線引き）。既に承諾済みなら何もしない。
 * 画面に表示した開示文言の版（consent_version）が現行版と一致するときだけ記録する（表示と記録の文言がずれないように）。
 * 店舗が事前承諾を必須にする前に、既存の顧客から承諾を集める導線（OPEN_QUESTIONS G3/G4 #1）。
 */
import { z } from "zod";
import { cookies } from "next/headers";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import {
  apiOk,
  apiError,
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { CUSTOMER_COOKIE, getTenantIdBySlug, validateSession } from "@/lib/customerPortalServer";
import { DELIVERY_CONSENT_VERSION, computeDeliveryConsentTextHash } from "@/lib/delivery/deliveryConsent";
import { logTenantAuditEvent } from "@/lib/audit/tenantLog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const postSchema = z.object({
  tenant_slug: z.string().trim().min(1).max(100),
  consent_version: z.string().trim().min(1).max(100),
});

export async function POST(req: Request) {
  const limited = await checkRateLimit(req, "sensitive");
  if (limited) return limited;
  try {
    const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    if (parsed.data.consent_version !== DELIVERY_CONSENT_VERSION) {
      return apiError({
        code: "conflict",
        message: "承諾の文言が更新されました。ページを再読み込みして、最新の文言をご確認ください。",
        status: 409,
      });
    }

    const tenantId = await getTenantIdBySlug(parsed.data.tenant_slug);
    if (!tenantId) return apiNotFound("unknown tenant");
    const token = (await cookies()).get(CUSTOMER_COOKIE)?.value ?? "";
    const session = token ? await validateSession(tenantId, token) : null;
    if (!session?.customer_id) return apiUnauthorized();

    const admin = createServiceRoleAdmin("customer delivery-consent grant — portal session bound to customer_id");
    const { data: current, error: readErr } = await admin
      .from("delivery_consents")
      .select("status, revoked_at, revoked_via")
      .eq("tenant_id", tenantId)
      .eq("customer_id", session.customer_id)
      .maybeSingle();
    if (readErr) return apiInternalError(readErr, "customer/delivery-consent/grant read");
    const prev = current as { status: string; revoked_at: string | null; revoked_via: string | null } | null;
    // 既に承諾済みなら何もしない（店舗が記録した承諾＝誰がいつ取ったかを、古い画面からの操作で上書きしない）。
    if (prev?.status === "granted") return apiOk({ status: "granted" });

    const now = new Date().toISOString();
    // 使用者本人の承諾は granted_by=null で表す（店舗の記録は必ず granted_by=操作者）。method は「示した交付方法」の列なので
    // 入れず、示した文言は consent_version / consent_text_hash で特定する。撤回後の再承諾は同じ行を上書きするので、
    // 撤回の記録は下の監査ログに残す（G4 の証跡: 撤回中に電子交付を止めていたことを後から示せるように）。
    const { error } = await admin.from("delivery_consents").upsert(
      {
        tenant_id: tenantId,
        customer_id: session.customer_id,
        status: "granted",
        method: null,
        note: null,
        consent_version: DELIVERY_CONSENT_VERSION,
        consent_text_hash: computeDeliveryConsentTextHash(),
        granted_at: now,
        granted_by: null,
        revoked_at: null,
        revoked_by: null,
        revoked_via: null,
        updated_at: now,
      },
      { onConflict: "tenant_id,customer_id" },
    );
    if (error) return apiInternalError(error, "customer/delivery-consent/grant");
    void logTenantAuditEvent(admin, {
      tenantId,
      actorType: "system",
      action: "delivery_consent_granted_by_customer",
      table: "delivery_consents",
      recordId: session.customer_id,
      extra: {
        consent_version: DELIVERY_CONSENT_VERSION,
        previous_status: prev?.status ?? "none",
        previous_revoked_at: prev?.revoked_at ?? null,
        previous_revoked_via: prev?.revoked_via ?? null,
      },
      req,
    });
    return apiOk({ status: "granted" });
  } catch (e) {
    return apiInternalError(e, "customer/delivery-consent/grant");
  }
}
