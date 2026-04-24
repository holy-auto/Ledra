import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/workflow-analytics
 * ワークフロー工数分析データを返す
 *
 * Query params:
 *   period  = "7d" | "30d" | "90d"  (default: "30d")
 *   service_type = coating | ppf | wrapping | body_repair | other
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") ?? "30d";
    const serviceType = searchParams.get("service_type") ?? null;

    // Convert period string to days
    const periodDays = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

    // Fetch completed step logs for the period
    const logsQuery = supabase
      .from("reservation_step_logs")
      .select("step_key, step_label, step_order, duration_sec, completed_at, reservation_id")
      .eq("tenant_id", caller.tenantId)
      .not("completed_at", "is", null)
      .not("duration_sec", "is", null)
      .gte("completed_at", since)
      .order("step_order", { ascending: true });

    const { data: logs, error: logsError } = await logsQuery;
    if (logsError) {
      return apiInternalError(logsError, "workflow-analytics logs");
    }

    // Fetch completed reservations with workflow templates for service_type filtering
    const reservationsQuery = supabase
      .from("reservations")
      .select("id, workflow_template_id, status")
      .eq("tenant_id", caller.tenantId)
      .eq("status", "completed")
      .not("workflow_template_id", "is", null)
      .gte("updated_at", since);

    const { data: reservations } = await reservationsQuery;

    // If service_type filter is requested, filter reservation IDs by template service_type
    let filteredReservationIds: Set<string> | null = null;
    if (serviceType && reservations && reservations.length > 0) {
      const templateIds = [...new Set(reservations.map((r) => r.workflow_template_id).filter(Boolean))];
      const { data: templates } = await supabase
        .from("workflow_templates")
        .select("id, service_type")
        .in("id", templateIds as string[]);

      if (templates) {
        const matchingTemplateIds = new Set(templates.filter((t) => t.service_type === serviceType).map((t) => t.id));
        filteredReservationIds = new Set(
          reservations
            .filter((r) => r.workflow_template_id && matchingTemplateIds.has(r.workflow_template_id))
            .map((r) => r.id),
        );
      }
    }

    // Filter logs to matching reservations if service_type is specified
    const activeLogs = filteredReservationIds
      ? (logs ?? []).filter((l) => filteredReservationIds!.has(l.reservation_id))
      : (logs ?? []);

    // Aggregate per step_key
    const stepMap = new Map<string, { label: string; order: number; durations: number[] }>();

    for (const log of activeLogs) {
      if (!log.duration_sec || log.duration_sec <= 0) continue;
      const existing = stepMap.get(log.step_key);
      if (existing) {
        existing.durations.push(log.duration_sec);
      } else {
        stepMap.set(log.step_key, {
          label: log.step_label ?? log.step_key,
          order: log.step_order ?? 0,
          durations: [log.duration_sec],
        });
      }
    }

    const steps = Array.from(stepMap.entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, { label, order, durations }]) => {
        const sorted = [...durations].sort((a, b) => a - b);
        const avg = Math.round(durations.reduce((s, d) => s + d, 0) / durations.length);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const median = sorted[Math.floor(sorted.length / 2)];
        return {
          key,
          label,
          order,
          count: durations.length,
          avg_min: Math.round(avg / 60),
          min_min: Math.round(min / 60),
          max_min: Math.round(max / 60),
          median_min: Math.round(median / 60),
        };
      });

    // Total workflow duration per reservation
    const reservationDurations = new Map<string, number>();
    for (const log of activeLogs) {
      if (!log.duration_sec || log.duration_sec <= 0) continue;
      const cur = reservationDurations.get(log.reservation_id) ?? 0;
      reservationDurations.set(log.reservation_id, cur + log.duration_sec);
    }
    const totalDurations = [...reservationDurations.values()];
    const avgTotalMin =
      totalDurations.length > 0
        ? Math.round(totalDurations.reduce((s, d) => s + d, 0) / totalDurations.length / 60)
        : 0;

    // Trend: group completed reservations by day
    const dayMap = new Map<string, number>();
    for (const [resId] of reservationDurations) {
      const res = (reservations ?? []).find((r) => r.id === resId);
      if (!res) continue;
      // find last log for this reservation
      const resLogs = activeLogs.filter((l) => l.reservation_id === resId && l.completed_at);
      if (resLogs.length === 0) continue;
      const lastLog = resLogs.reduce((latest, l) => (l.completed_at! > latest.completed_at! ? l : latest));
      const day = lastLog.completed_at!.slice(0, 10);
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    const trend = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return NextResponse.json({
      period,
      service_type: serviceType,
      total_reservations: reservationDurations.size,
      avg_total_min: avgTotalMin,
      steps,
      trend,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "workflow-analytics GET");
  }
}
