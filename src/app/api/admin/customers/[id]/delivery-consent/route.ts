import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiJson, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";
import {
  DELIVERY_CONSENT_VERSION,
  computeDeliveryConsentTextHash,
  deliveryConsentStatus,
} from "@/lib/delivery/deliveryConsent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 顧客単位の「電子交付への事前承諾」の取得・記録・撤回。 [G3/G4 / 第２ ４（３）（４）]
 *
 *   GET    … 現在の承諾状態（none/granted/revoked）と付随情報
 *   POST   … 承諾を記録（granted）。開示した交付方法 method と任意メモを残す（書面/口頭で得た承諾の記録を含む）
 *   DELETE … 店舗代行での撤回（revoked・revoked_via='admin'）。使用者本人の撤回は /api/customer/delivery-consent/revoke。
 *
 * 見積/請求の送付（documents/share）は対象外。規制対象記録（証明書＝記録簿の写し）の電子交付にのみ効かせる。
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function customerInTenant(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  customerId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("customers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", customerId)
    .maybeSingle();
  return !!data;
}

export const GET = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    try {
      const customerId = params.id;
      if (!UUID_RE.test(customerId)) return apiValidationError("顧客 ID が不正です。");
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data, error } = await admin
        .from("delivery_consents")
        .select("status, method, consent_version, granted_at, granted_by, revoked_at, revoked_via, note, updated_at")
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", customerId)
        .maybeSingle();
      if (error) return apiInternalError(error, "delivery-consent GET");
      return apiJson({ status: deliveryConsentStatus(data), consent: data ?? null });
    } catch (e) {
      return apiInternalError(e, "delivery-consent GET");
    }
  },
  { permission: "customers:view", routeName: "delivery-consent GET" },
);

export const POST = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    try {
      const customerId = params.id;
      if (!UUID_RE.test(customerId)) return apiValidationError("顧客 ID が不正です。");
      const body = (await req.json().catch(() => ({}))) as { method?: unknown; note?: unknown };
      const method = typeof body.method === "string" ? body.method.trim().slice(0, 200) || null : null;
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null;

      const { admin } = createTenantScopedAdmin(caller.tenantId);
      if (!(await customerInTenant(admin, caller.tenantId, customerId))) {
        return apiNotFound("顧客が見つかりません。");
      }

      const now = new Date().toISOString();
      // 承諾の記録（granted）。再承諾（撤回後の再取得）も同じ行を上書きするので revoked_* をクリアする。
      const { error } = await admin.from("delivery_consents").upsert(
        {
          tenant_id: caller.tenantId,
          customer_id: customerId,
          status: "granted",
          method,
          consent_version: DELIVERY_CONSENT_VERSION,
          consent_text_hash: computeDeliveryConsentTextHash(),
          granted_at: now,
          granted_by: caller.userId,
          revoked_at: null,
          revoked_by: null,
          revoked_via: null,
          note,
          updated_at: now,
        },
        { onConflict: "tenant_id,customer_id" },
      );
      if (error) return apiInternalError(error, "delivery-consent POST");
      return apiOk({ status: "granted" });
    } catch (e) {
      return apiInternalError(e, "delivery-consent POST");
    }
  },
  { permission: "customers:edit", routeName: "delivery-consent POST" },
);

export const DELETE = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    try {
      const customerId = params.id;
      if (!UUID_RE.test(customerId)) return apiValidationError("顧客 ID が不正です。");
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      if (!(await customerInTenant(admin, caller.tenantId, customerId))) {
        return apiNotFound("顧客が見つかりません。");
      }
      const now = new Date().toISOString();
      // 店舗代行の撤回。行が無くても「撤回済み」を先回りで記録できるよう upsert。
      const { error } = await admin.from("delivery_consents").upsert(
        {
          tenant_id: caller.tenantId,
          customer_id: customerId,
          status: "revoked",
          revoked_at: now,
          revoked_by: caller.userId,
          revoked_via: "admin",
          updated_at: now,
        },
        { onConflict: "tenant_id,customer_id" },
      );
      if (error) return apiInternalError(error, "delivery-consent DELETE");
      return apiOk({ status: "revoked" });
    } catch (e) {
      return apiInternalError(e, "delivery-consent DELETE");
    }
  },
  { permission: "customers:edit", routeName: "delivery-consent DELETE" },
);
