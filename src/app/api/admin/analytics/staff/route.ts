/**
 * GET /api/admin/analytics/staff?window=30d|90d|365d|all
 *
 * Tenant-scoped staff performance dashboard data.
 * Manager (admin) or above required — line staff shouldn't be
 * able to enumerate their peers' performance.
 */
import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { getStaffPerformance, type AnalyticsWindow } from "@/lib/analytics/staff";

export const dynamic = "force-dynamic";

const VALID_WINDOWS: ReadonlySet<AnalyticsWindow> = new Set(["30d", "90d", "365d", "all"] as const);

function parseWindow(raw: string | null): AnalyticsWindow {
  if (raw && (VALID_WINDOWS as Set<string>).has(raw)) return raw as AnalyticsWindow;
  return "30d";
}

export async function GET(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasMinRole(caller.role, "admin")) {
      return apiForbidden("この機能には管理者権限が必要です。");
    }

    const window = parseWindow(new URL(req.url).searchParams.get("window"));
    const result = await getStaffPerformance({ tenantId: caller.tenantId, window });

    return apiJson(result);
  } catch (e) {
    return apiInternalError(e, "admin/analytics/staff");
  }
}
