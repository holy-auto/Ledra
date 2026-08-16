/**
 * POST /api/customer/data-deletion
 *
 * GDPR 第 17 条 / 個人情報保護法 第 35 条 (利用停止・消去) に基づく
 * 顧客発の削除リクエスト。30 日のクーリングオフ後に
 * `/api/cron/data-retention` 系の処理が PII を匿名化する。
 *
 * 認証: 顧客ポータル session cookie のみ。リクエスト時の IP も保存
 * (誤請求調査 + 法的証跡)。
 */

import { cookies } from "next/headers";
import { z } from "zod";
import { apiOk, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { CUSTOMER_COOKIE, getTenantIdBySlug, validateSession } from "@/lib/customerPortalServer";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const schema = z.object({
  tenant_slug: z.string().trim().min(1).max(100),
  reason: z.string().trim().max(2000).optional(),
});

export async function POST(req: Request) {
  try {
    // 削除リクエストの連打（請求フラッピング・証跡汚染）を抑止。
    const limited = await checkRateLimit(req, "sensitive");
    if (limited) return limited;

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const tenantId = await getTenantIdBySlug(parsed.data.tenant_slug);
    if (!tenantId) return apiNotFound("unknown tenant");

    const cookieStore = await cookies();
    const token = cookieStore.get(CUSTOMER_COOKIE)?.value ?? "";
    if (!token) return apiUnauthorized();

    const session = await validateSession(tenantId, token);
    if (!session) return apiUnauthorized();

    const admin = createServiceRoleAdmin(
      "customer/data-deletion — pre-resolved tenant via session, inserts deletion request",
    );

    const ip = getClientIp(req);

    const { data, error } = await admin
      .from("customer_deletion_requests")
      .insert({
        tenant_id: tenantId,
        customer_id: session.customer_id ?? null,
        email: session.email,
        phone_last4_hash: session.phone_last4_hash,
        reason: parsed.data.reason ?? null,
        source_ip: ip,
      })
      .select("id, scheduled_for")
      .single();

    if (error) return apiInternalError(error, "data-deletion insert");

    logger.info("customer data deletion requested", {
      tenantId,
      customerId: session.customer_id ?? null,
      requestId: (data as { id: string }).id,
    });

    return apiOk({
      ok: true,
      request_id: (data as { id: string }).id,
      scheduled_for: (data as { scheduled_for: string }).scheduled_for,
      message: "ご請求を承りました。30 日のクーリングオフ期間中はキャンセル可能です。",
    });
  } catch (e) {
    return apiInternalError(e, "customer/data-deletion");
  }
}

/** DELETE — クーリングオフ期間中の撤回 */
export async function DELETE(req: Request) {
  try {
    const limited = await checkRateLimit(req, "sensitive");
    if (limited) return limited;

    const url = new URL(req.url);
    const tenantSlug = (url.searchParams.get("tenant") ?? "").trim();
    if (!tenantSlug) return apiValidationError("missing tenant");

    const tenantId = await getTenantIdBySlug(tenantSlug);
    if (!tenantId) return apiNotFound("unknown tenant");

    const cookieStore = await cookies();
    const token = cookieStore.get(CUSTOMER_COOKIE)?.value ?? "";
    if (!token) return apiUnauthorized();

    const session = await validateSession(tenantId, token);
    if (!session) return apiUnauthorized();

    const admin = createServiceRoleAdmin("customer/data-deletion DELETE — cancel pending request");

    // LINE ログインのセッションは email を持たない。postgrest の eq は NULL に
    // 一致しないため email で引くと撤回が黙って 0 件になり、30 日後に本当に消える。
    // customer_id があるときは必ずそちらで引く (audit-log と同じ方針)。
    // 両方あるセッションでは OR で引く。customer_id だけに絞ると、customer_id を
    // 持たずに作られた過去の申請を撤回できなくなるため。
    // email は `,` や `(` を含み得るので postgrest のフィルタ文字列にそのまま埋めない
    // (customer_id は uuid なのでそのままでよい)。
    const quoted = (v: string) => `"${v.replace(/["\\]/g, "\\$&")}"`;
    const scope = [
      session.customer_id ? `customer_id.eq.${session.customer_id}` : null,
      session.email ? `email.eq.${quoted(session.email)}` : null,
    ]
      .filter(Boolean)
      .join(",");
    if (!scope) return apiUnauthorized();

    const { error, count } = await admin
      .from("customer_deletion_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() }, { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .or(scope);

    if (error) return apiInternalError(error, "data-deletion cancel");
    return apiOk({ ok: true, cancelled: count ?? 0 });
  } catch (e) {
    return apiInternalError(e, "customer/data-deletion cancel");
  }
}
