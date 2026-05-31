/**
 * GET /api/admin/settings/ai-automation/recommendations
 *
 * ai_usage_logs の実績から「自動化レベルを上げてよいか」を推薦する。
 * 設定画面で「この機能は自動化(opt-in)を推奨」のように提示するのに使う。
 *
 * - 期間: ?days=7 / 30 / 90 (デフォルト 30)
 * - 壁3 は推薦対象に含めない (feedbackLoop の ENDPOINT_META に存在しない)
 * - テーブル未マイグレーション時は空配列で 200 を返す (UI を壊さない)。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { recommendAutoActions, type UsageRowLike } from "@/lib/ai/automation/feedbackLoop";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isMissingTableError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const daysRaw = Number(url.searchParams.get("days") ?? "30");
    const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const settings = await loadAiAutomationSettings(tenantId, { applyCostCap: false });

    const { data, error } = await admin
      .from("ai_usage_logs")
      .select("endpoint, outcome, confidence")
      .eq("tenant_id", tenantId)
      .gte("created_at", cutoff)
      .limit(10000);

    if (error) {
      if (isMissingTableError(error)) {
        return apiOk({
          recommendations: [],
          days,
          warning: "ai_usage_logs テーブルが未作成のため推薦はありません。",
        });
      }
      return apiInternalError(error, "ai-automation recommendations GET");
    }

    const recommendations = recommendAutoActions((data ?? []) as UsageRowLike[], settings);
    return apiOk({ recommendations, days });
  } catch (e: unknown) {
    return apiInternalError(e, "ai-automation recommendations GET");
  }
}
