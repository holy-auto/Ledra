import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiJson, apiError, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";
import { logTenantAuditEvent } from "@/lib/audit/tenantLog";
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
 *            ?mode=cancel_record のときは、押し間違えた「店舗の記録」の取り消し（店舗が記録した承諾だけを消して未承諾に戻す）。
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
      // 承諾の記録（granted）。revoked_* は消さずに残す（直前の撤回の記録。押し間違いを取り消すときに撤回へ戻すため。
      // 状態の判定は status だけを見るので、granted の行に残った revoked_* は判定に影響しない）。
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
          note,
          updated_at: now,
        },
        { onConflict: "tenant_id,customer_id" },
      );
      if (error) return apiInternalError(error, "delivery-consent POST");
      // 店舗の記録は行を上書きするので、誰がいつ記録したかの履歴は監査ログに残す。
      void logTenantAuditEvent(admin, {
        tenantId: caller.tenantId,
        userId: caller.userId,
        action: "delivery_consent_recorded_by_shop",
        table: "delivery_consents",
        recordId: customerId,
        extra: { method, consent_version: DELIVERY_CONSENT_VERSION },
        req,
      });
      return apiOk({ status: "granted" });
    } catch (e) {
      return apiInternalError(e, "delivery-consent POST");
    }
  },
  { permission: "customers:edit", routeName: "delivery-consent POST" },
);

export const DELETE = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    try {
      const customerId = params.id;
      if (!UUID_RE.test(customerId)) return apiValidationError("顧客 ID が不正です。");
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      if (!(await customerInTenant(admin, caller.tenantId, customerId))) {
        return apiNotFound("顧客が見つかりません。");
      }
      const mode = new URL(req.url).searchParams.get("mode");
      // 知らない mode を撤回として扱わない（撤回はお客様が断った記録になるので、取り違えると実害がある）。
      if (mode !== null && mode !== "cancel_record") return apiValidationError("mode が不正です。");
      // 押し間違えた「店舗の記録」の取り消し（撤回とは別）。押す前の状態に戻す:
      // 記録の前に撤回があれば撤回に（店舗の記録は revoked_* を残している）、無ければ未承諾（行なし）に。
      // お客様本人の承諾（granted_by=null）は店舗からは取り消せない（本人の操作の証跡なので）。
      if (mode === "cancel_record") {
        const { data: current, error: readErr } = await admin
          .from("delivery_consents")
          .select("status, granted_at, granted_by, method, note, consent_version, revoked_at, revoked_by, revoked_via")
          .eq("tenant_id", caller.tenantId)
          .eq("customer_id", customerId)
          .maybeSingle();
        if (readErr) return apiInternalError(readErr, "delivery-consent cancel_record read");
        const cur = current as { status: string; granted_by: string | null; revoked_at: string | null } | null;
        if (cur?.status !== "granted" || !cur.granted_by) {
          return apiError({ code: "conflict", message: "取り消せるのは、店舗が記録した承諾だけです。", status: 409 });
        }
        const restored = cur.revoked_at ? "revoked" : "none";
        const target = admin.from("delivery_consents");
        const write =
          restored === "revoked"
            ? target.update({
                status: "revoked",
                method: null,
                note: null,
                consent_version: null,
                consent_text_hash: null,
                granted_at: null,
                granted_by: null,
                updated_at: new Date().toISOString(),
              })
            : target.delete();
        // 読んでから書くまでに状態が変わっていたら（本人の承諾・撤回が入った等）何もしない。
        const { data: changed, error: writeErr } = await write
          .eq("tenant_id", caller.tenantId)
          .eq("customer_id", customerId)
          .eq("status", "granted")
          .not("granted_by", "is", null)
          .select("customer_id");
        if (writeErr) return apiInternalError(writeErr, "delivery-consent cancel_record");
        if (!Array.isArray(changed) || changed.length === 0) {
          return apiError({
            code: "conflict",
            message: "承諾の状態が変わったため取り消せませんでした。画面を再読み込みしてください。",
            status: 409,
          });
        }
        // 店舗の記録の中身は消えるので、取り消した記録と戻した先を監査ログに残す。
        void logTenantAuditEvent(admin, {
          tenantId: caller.tenantId,
          userId: caller.userId,
          action: "delivery_consent_record_cancelled_by_shop",
          table: "delivery_consents",
          recordId: customerId,
          extra: { cancelled: current, restored },
          req,
        });
        return apiOk({ status: restored });
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
      void logTenantAuditEvent(admin, {
        tenantId: caller.tenantId,
        userId: caller.userId,
        action: "delivery_consent_revoked_by_shop",
        table: "delivery_consents",
        recordId: customerId,
        req,
      });
      return apiOk({ status: "revoked" });
    } catch (e) {
      return apiInternalError(e, "delivery-consent DELETE");
    }
  },
  { permission: "customers:edit", routeName: "delivery-consent DELETE" },
);
