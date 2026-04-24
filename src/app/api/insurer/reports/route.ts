import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/insurer/reports
 * Case reports: period trends, status/category breakdown, avg resolution time.
 * Query params: period=monthly|weekly (default: monthly)
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const { admin } = createInsurerScopedAdmin(caller.insurerId);
  const insurerId = caller.insurerId;

  const url = new URL(req.url);
  const period = url.searchParams.get("period") === "weekly" ? "weekly" : "monthly";

  // For monthly: last 12 months; for weekly: last 12 weeks
  const since = new Date();
  if (period === "monthly") {
    since.setMonth(since.getMonth() - 12);
  } else {
    since.setDate(since.getDate() - 12 * 7);
  }
  const sinceISO = since.toISOString();

  try {
    const { data: cases, error: casesErr } = await admin
      .from("insurer_cases")
      .select("status, category, created_at, resolved_at")
      .eq("insurer_id", insurerId)
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: true });

    if (casesErr) throw casesErr;

    const rows = cases ?? [];

    // 1. Period trend
    const periodMap: Record<string, number> = {};
    for (const c of rows) {
      const d = new Date(c.created_at);
      let key: string;
      if (period === "monthly") {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      } else {
        // ISO week: use Monday-based week start date
        const dayOfWeek = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
        key = monday.toISOString().substring(0, 10);
      }
      periodMap[key] = (periodMap[key] ?? 0) + 1;
    }

    const period_trend = Object.entries(periodMap)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => a.label.localeCompare(b.label));

    // 2. Status breakdown
    const statusMap: Record<string, number> = {};
    for (const c of rows) {
      const s = c.status ?? "unknown";
      statusMap[s] = (statusMap[s] ?? 0) + 1;
    }
    const status_breakdown = Object.entries(statusMap)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    // 3. Category breakdown
    const catMap: Record<string, number> = {};
    for (const c of rows) {
      const cat = c.category ?? "未分類";
      catMap[cat] = (catMap[cat] ?? 0) + 1;
    }
    const category_breakdown = Object.entries(catMap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // 4. Average resolution time (hours)
    let totalHours = 0;
    let resolvedCount = 0;
    for (const c of rows) {
      if (c.resolved_at && c.created_at) {
        const diff = new Date(c.resolved_at).getTime() - new Date(c.created_at).getTime();
        if (diff > 0) {
          totalHours += diff / (1000 * 60 * 60);
          resolvedCount++;
        }
      }
    }
    const avg_resolution_hours = resolvedCount > 0 ? Math.round((totalHours / resolvedCount) * 10) / 10 : null;

    return apiJson({
      period,
      period_trend,
      status_breakdown,
      category_breakdown,
      avg_resolution_hours,
      total_cases: rows.length,
      resolved_cases: resolvedCount,
    });
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/reports");
  }
}
