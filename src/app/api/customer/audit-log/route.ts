/**
 * GET /api/customer/audit-log
 *
 * 顧客が「自分の証明書 / 顧客レコードに対してテナント側で実行された
 * 操作の履歴」を確認するためのエンドポイント。
 *
 * `audit_logs` には顧客への直接の紐付け（customer_id / email）が無い。
 * 代わりに、その顧客の証明書の public_id を引いてから
 * `target_public_id` で絞る。保険会社の閲覧・出力はこの列に記録されるので、
 * 「自分の証明書が誰にいつ見られたか」がこの経路で出せる。
 * 直近 90 日 / 最大 500 件まで。
 *
 * 注: 以前は target_type / target_id / actor_role / occurred_at / metadata /
 * subject_customer_id / subject_email という**実在しない列**を読んでいたため、
 * このエンドポイントは常に 500 を返していた。
 */

import { cookies } from "next/headers";
import { apiOk, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { CUSTOMER_COOKIE, getTenantIdBySlug, validateSession } from "@/lib/customerPortalServer";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    // 監査ログのポーリング/列挙を抑止（IP 単位の一般上限）。
    const limited = await checkRateLimit(req, "general");
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

    const admin = createServiceRoleAdmin(
      "customer/audit-log — fetches audit_logs scoped to caller customer_id pre-resolved by session",
    );

    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();

    // 顧客の証明書の公開 ID を先に引く。session に customer_id が無い旧セッションは
    // 顧客を特定できないため、他人の履歴を出さないよう空で返す
    if (!session.customer_id) {
      return apiOk({ total: 0, events: [], window_days: 90 });
    }

    const { data: certs, error: certErr } = await admin
      .from("certificates")
      .select("public_id")
      .eq("tenant_id", tenantId)
      .eq("customer_id", session.customer_id)
      .limit(500);
    if (certErr) return apiInternalError(certErr, "customer audit-log certs");

    const publicIds = (certs ?? []).map((c) => c.public_id as string).filter(Boolean);
    if (publicIds.length === 0) {
      return apiOk({ total: 0, events: [], window_days: 90 });
    }

    const { data, error, count } = await admin
      .from("audit_logs")
      .select("id, action, actor_type, target_public_id, query_json, performed_at", { count: "exact" })
      .eq("tenant_id", tenantId)
      .in("target_public_id", publicIds)
      .gte("performed_at", since)
      .order("performed_at", { ascending: false })
      .limit(500);
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
