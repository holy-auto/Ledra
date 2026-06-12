/**
 * GET /api/admin/analytics/pricing-intelligence?refresh=1
 *
 * テナント実勢価格 (pricingIntelligence) の集計結果を返す。
 * `refresh=1` で 1 時間キャッシュをバイパスして再計算する。
 *
 * RBAC: admin 以上。
 */
import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { buildPricingContext } from "@/lib/ai/pricingIntelligence";

export const dynamic = "force-dynamic";

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

    const force = new URL(req.url).searchParams.get("refresh") === "1";
    const context = await buildPricingContext(caller.tenantId, 365, { force });

    return apiJson(context);
  } catch (e) {
    return apiInternalError(e, "admin/analytics/pricing-intelligence");
  }
}
