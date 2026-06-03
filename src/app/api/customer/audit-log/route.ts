/**
 * GET /api/customer/audit-log
 *
 * 顧客が「自分の証明書 / 顧客レコードに対してテナント側で実行された
 * 操作の履歴」を確認するためのエンドポイント。
 *
 * Phase 1 (本実装): `audit_logs` のうち caller の customer_id / email に
 * 紐付くものを返す。直近 90 日 / 最大 500 件まで。
 */

import { cookies } from "next/headers";
import { apiOk, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { CUSTOMER_COOKIE, CUSTOMER_COOKIE_CLEAR_OPTIONS, getTenantIdBySlug, validateSession } from "@/lib/customerPortalServer";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenantSlug = (url.searchParams.get("tenant") ?? "").trim();
    if (!tenantSlug) return apiValidationError("missing tenant");

    const tenantId = await getTenantIdBySlug(tenantSlug);
    if (!tenantId) return apiNotFound("unknown tenant");

    const cookieStore = await cookies();
    const token = cookieStore.get(CUSTOMER_COOKIE)?.value ?? "";
    if (!token) return apiUnauthorized();

    const session = await validateSession(tenantId, token);
    if (!session) {
      const res = apiUnauthorized();
      res.cookies.set(CUSTOMER_COOKIE, "", CUSTOMER_COOKIE_CLEAR_OPTIONS);
      return res;
    }

    const admin = createServiceRoleAdmin(
      "customer/audit-log — fetches audit_logs scoped to caller customer_id pre-resolved by session",
    );

    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();

    let query = admin
      .from("audit_logs")
      .select("id, action, target_type, target_id, actor_role, occurred_at, metadata", { count: "exact" })
      .eq("tenant_id", tenantId)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(500);

    if (session.customer_id) {
      // Strict path: bound by customer_id when session has it.
      query = query.eq("subject_customer_id", session.customer_id);
    } else {
      // Legacy fallback: filter by email until session has customer_id.
      query = query.eq("subject_email", session.email);
    }

    const { data, error, count } = await query;
    if (error) return apiInternalError(error, "customer audit-log");

    return apiOk({
      total: count ?? data?.length ?? 0,
      events: data ?? [],
      window_days: 90,
    });
  } catch (e) {
    return apiInternalError(e, "customer/audit-log");
  }
}
