import { NextRequest } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type DailyCount = { date: string; count: number };
type KeywordCount = { keyword: string; count: number };
type ActionCount = { action: string; count: number };

type AnalyticsPayload = {
  daily_counts: DailyCount[];
  top_keywords: KeywordCount[];
  action_breakdown: ActionCount[];
};

const EMPTY_PAYLOAD: AnalyticsPayload = {
  daily_counts: [],
  top_keywords: [],
  action_breakdown: [],
};

/**
 * GET /api/insurer/analytics
 *
 * Delegates the 30-day aggregation to the `analytics_insurer_30days` RPC
 * so we neither materialize 30 days of rows in Node memory nor pay three
 * separate round-trips. The RPC also pads missing days with count=0.
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    const { data, error } = await admin.rpc("analytics_insurer_30days", {
      p_insurer_id: caller.insurerId,
      p_days: 30,
    });
    if (error) throw error;

    const payload = (data as AnalyticsPayload | null) ?? EMPTY_PAYLOAD;
    return apiJson(payload);
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/analytics");
  }
}
