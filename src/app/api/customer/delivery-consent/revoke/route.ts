/**
 * POST /api/customer/delivery-consent/revoke — 使用者本人が「電子交付の承諾」を撤回する。 [G4 / 第２ ４（４）]
 *
 * body { tenant_slug }
 * 認証: 顧客ポータルセッション（customer_id 紐付きのみ。/api/customer/pii-consent と同じ線引き）。
 * 撤回後は規制対象記録（証明書＝記録簿の写し）の電子交付がブロックされる（受領サイン依頼側で判定）。
 */
import { z } from "zod";
import { cookies } from "next/headers";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { CUSTOMER_COOKIE, getTenantIdBySlug, validateSession } from "@/lib/customerPortalServer";
import { logTenantAuditEvent } from "@/lib/audit/tenantLog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const postSchema = z.object({ tenant_slug: z.string().trim().min(1).max(100) });

export async function POST(req: Request) {
  const limited = await checkRateLimit(req, "sensitive");
  if (limited) return limited;
  try {
    const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");

    const tenantId = await getTenantIdBySlug(parsed.data.tenant_slug);
    if (!tenantId) return apiNotFound("unknown tenant");
    const token = (await cookies()).get(CUSTOMER_COOKIE)?.value ?? "";
    const session = token ? await validateSession(tenantId, token) : null;
    if (!session?.customer_id) return apiUnauthorized();

    const admin = createServiceRoleAdmin("customer delivery-consent revoke — portal session bound to customer_id");
    const now = new Date().toISOString();
    // 使用者本人の撤回（revoked_via='customer'・revoked_by=null）。行が無くても先回りで撤回を記録。
    const { error } = await admin.from("delivery_consents").upsert(
      {
        tenant_id: tenantId,
        customer_id: session.customer_id,
        status: "revoked",
        revoked_at: now,
        revoked_by: null,
        revoked_via: "customer",
        updated_at: now,
      },
      { onConflict: "tenant_id,customer_id" },
    );
    if (error) return apiInternalError(error, "customer/delivery-consent/revoke");
    // 再承諾で行が上書きされても撤回の事実と接続元が残るように（G4 の証跡）。
    void logTenantAuditEvent(admin, {
      tenantId,
      actorType: "system",
      action: "delivery_consent_revoked_by_customer",
      table: "delivery_consents",
      recordId: session.customer_id,
      req,
    });
    return apiOk({ status: "revoked" });
  } catch (e) {
    return apiInternalError(e, "customer/delivery-consent/revoke");
  }
}
