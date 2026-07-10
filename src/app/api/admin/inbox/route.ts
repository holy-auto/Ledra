import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { fetchApprovalInbox } from "@/lib/admin/approvalInboxData";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/inbox
 * 承認インボックス: 当テナントで人の承認を待つドラフト（証明書 / 発注 / 請求）を
 * 集約して返す。データ取得は fetchApprovalInbox に集約（ダッシュボードの承認
 * ウィジェットと共通化）。RLS + 明示の tenant_id で当テナントに限定。
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const result = await fetchApprovalInbox(supabase, caller.tenantId);
    return apiJson(result);
  } catch (e) {
    return apiInternalError(e, "admin/inbox GET");
  }
}
