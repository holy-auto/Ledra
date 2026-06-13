/**
 * GET /api/admin/job-progress
 *
 * 作業進捗ボード用データ。doc_type='invoice' の請求書を進捗ステージ別に
 * 集約して返す。引渡済み (delivered) は直近 7 日以内のものだけ含める。
 *
 * AuthZ: テナントメンバー (staff 以上) は閲覧可。
 * テナント境界は createTenantScopedAdmin + 明示的 tenant_id 絞り込みで担保。
 */
import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { getJobProgressBoard } from "@/lib/jobProgress/board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const board = await getJobProgressBoard(caller.tenantId);
    return apiJson({ ok: true, ...board });
  } catch (e) {
    return apiInternalError(e, "admin/job-progress GET");
  }
}
