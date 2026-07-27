import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { searchEntities } from "@/lib/search/entities";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/search?q=QUERY&limit=5
 *
 * Global search across certificates, customers, vehicles, and invoices.
 * Returns grouped results filtered by tenant. 検索本体は searchEntities() を
 * 単一の出典として共有（AI アシスタントの navigate ルートと同じ実装）。
 */
export async function GET(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get("limit") ?? "5", 10)));

    if (q.length < 2) {
      return apiValidationError("検索クエリは2文字以上入力してください。");
    }

    const results = await searchEntities(caller.tenantId, q, limit);
    return apiOk({ ...results });
  } catch (e) {
    return apiInternalError(e, "admin/search");
  }
}
