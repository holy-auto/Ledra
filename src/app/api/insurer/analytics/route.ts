import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/insurer/analytics
 * Search analytics for the current insurer: daily counts, top keywords, action breakdown.
 * Aggregates insurer_access_logs for the last 30 days.
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const admin = createAdminClient();
  const insurerId = caller.insurerId;

  // 30 days ago
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceISO = since.toISOString();

  try {
    // 1. Daily counts (last 30 days)
    const { data: logs, error: logsErr } = await admin
      .from("insurer_access_logs")
      .select("created_at")
      .eq("insurer_id", insurerId)
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: true });

    if (logsErr) throw logsErr;

    const dailyMap: Record<string, number> = {};
    for (const row of logs ?? []) {
      const date = row.created_at?.substring(0, 10);
      if (date) dailyMap[date] = (dailyMap[date] ?? 0) + 1;
    }

    // Fill in missing days with 0
    const daily_counts: { date: string; count: number }[] = [];
    const cursor = new Date(since);
    const today = new Date();
    while (cursor <= today) {
      const d = cursor.toISOString().substring(0, 10);
      daily_counts.push({ date: d, count: dailyMap[d] ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    // 2. Top keywords from search actions (meta->>'query')
    const { data: searchLogs, error: searchErr } = await admin
      .from("insurer_access_logs")
      .select("meta")
      .eq("insurer_id", insurerId)
      .eq("action", "search")
      .gte("created_at", sinceISO);

    if (searchErr) throw searchErr;

    const kwMap: Record<string, number> = {};
    for (const row of searchLogs ?? []) {
      const query = (row.meta as any)?.query;
      if (query && typeof query === "string" && query.trim()) {
        const kw = query.trim().toLowerCase();
        kwMap[kw] = (kwMap[kw] ?? 0) + 1;
      }
    }

    const top_keywords = Object.entries(kwMap)
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 3. Action breakdown
    const { data: actionLogs, error: actionErr } = await admin
      .from("insurer_access_logs")
      .select("action")
      .eq("insurer_id", insurerId)
      .gte("created_at", sinceISO);

    if (actionErr) throw actionErr;

    const actionMap: Record<string, number> = {};
    for (const row of actionLogs ?? []) {
      const action = row.action ?? "unknown";
      actionMap[action] = (actionMap[action] ?? 0) + 1;
    }

    const action_breakdown = Object.entries(actionMap)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ daily_counts, top_keywords, action_breakdown });
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/analytics");
  }
}
