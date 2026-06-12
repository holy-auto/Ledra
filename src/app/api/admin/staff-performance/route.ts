import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { getStaffMonthlyPerformance } from "@/lib/analytics/staffPerformanceMonthly";

export const dynamic = "force-dynamic";

/** year/month クエリのパース。未指定なら現在年月にフォールバック。 */
function resolveYearMonth(req: NextRequest): { year: number; month: number } {
  const now = new Date();
  const url = new URL(req.url);
  const yearRaw = Number(url.searchParams.get("year"));
  const monthRaw = Number(url.searchParams.get("month"));
  const year = Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : now.getFullYear();
  const month = Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : now.getMonth() + 1;
  return { year, month };
}

// GET: 指定 (またはデフォルト当月) の担当者別実績。
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { year, month } = resolveYearMonth(req);

    const result = await getStaffMonthlyPerformance({ tenantId: caller.tenantId, year, month });
    return apiJson(result);
  } catch (e: unknown) {
    return apiInternalError(e, "staff-performance GET");
  }
}
