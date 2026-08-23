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

    // 証明書の公開 ID をすべて集める。`.in()` に一度に流せる数には限りがあり
    // （URL 長）、上限で黙って切ると「見られた記録が無い」と読めてしまうので、
    // 分割して問い合わせ、切り捨てが起きたことは返り値で分かるようにする。
    const CERT_PAGE = 1000;
    const IN_CHUNK = 100;
    const publicIds: string[] = [];
    for (let from = 0; ; from += CERT_PAGE) {
      const { data: certs, error: certErr } = await admin
        .from("certificates")
        .select("public_id")
        .eq("tenant_id", tenantId)
        .eq("customer_id", session.customer_id)
        .order("created_at", { ascending: false })
        .range(from, from + CERT_PAGE - 1);
      if (certErr) return apiInternalError(certErr, "customer audit-log certs");
      publicIds.push(...(certs ?? []).map((c) => c.public_id as string).filter(Boolean));
      if (!certs || certs.length < CERT_PAGE) break;
    }
    if (publicIds.length === 0) {
      return apiOk({ total: 0, events: [], window_days: 90, truncated: false });
    }

    const MAX_EVENTS = 500;
    type AuditRow = Record<string, unknown> & { performed_at: string | null };
    const events: AuditRow[] = [];
    for (let i = 0; i < publicIds.length; i += IN_CHUNK) {
      const { data, error } = await admin
        .from("audit_logs")
        .select("id, action, actor_type, target_public_id, query_json, performed_at")
        .eq("tenant_id", tenantId)
        .in("target_public_id", publicIds.slice(i, i + IN_CHUNK))
        .gte("performed_at", since)
        .order("performed_at", { ascending: false })
        .limit(MAX_EVENTS);
      if (error) return apiInternalError(error, "customer audit-log");
      events.push(...((data ?? []) as AuditRow[]));
    }

    events.sort((a, b) => String(b.performed_at ?? "").localeCompare(String(a.performed_at ?? "")));
    const truncated = events.length > MAX_EVENTS;

    return apiOk({
      total: events.length,
      events: events.slice(0, MAX_EVENTS),
      window_days: 90,
      // 上限で切った場合に画面が「これで全部」と誤って見せないようにする
      truncated,
    });
  } catch (e) {
    return apiInternalError(e, "customer/audit-log");
  }
}
