/**
 * GET /api/admin/analytics/technician-performance?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 技術者 (assigned_user_id) 別の請求書件数 / 売上 / 平均単価 / 完了率。
 * from/to 未指定時は当月。
 *
 * AuthZ: 管理者 (admin) 以上。担当者横断のパフォーマンスは line staff に開放しない。
 * テナント境界は createTenantScopedAdmin + 明示的 tenant_id 絞り込み (lib 内)。
 */
import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { getTechnicianPerformance, normalizeDate } from "@/lib/analytics/technician";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 当月の月初・月末を YYYY-MM-DD で返す。 */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasMinRole(caller.role, "admin")) {
      return apiForbidden("この機能には管理者権限が必要です。");
    }

    const url = new URL(req.url);
    const def = currentMonthRange();
    const from = normalizeDate(url.searchParams.get("from")) ?? def.from;
    const to = normalizeDate(url.searchParams.get("to")) ?? def.to;

    const result = await getTechnicianPerformance({ tenantId: caller.tenantId, from, to });
    return apiJson({ ok: true, ...result });
  } catch (e) {
    return apiInternalError(e, "admin/analytics/technician-performance GET");
  }
}
