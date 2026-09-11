import { NextRequest } from "next/server";
import { apiForbidden, apiInternalError, apiOk, apiUnauthorized, apiValidationError } from "@/lib/api/response";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import { businessDateString } from "@/lib/datetime";
import { toWatchJob, WATCH_ACTIVE_STATUSES, type WatchReservationRow } from "@/lib/watch/today";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Apple Watch用: 当日の作業と、日をまたいで作業中の案件だけを小さく返す。 */
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "reservations:view")) return apiForbidden();

    const requestedDate = request.nextUrl.searchParams.get("date");
    if (requestedDate && !DATE_RE.test(requestedDate)) {
      return apiValidationError("date は YYYY-MM-DD 形式で指定してください");
    }

    const date = requestedDate ?? businessDateString();
    const storeId = request.nextUrl.searchParams.get("store_id");

    let query = caller.supabase
      .from("reservations")
      .select(
        "id, title, scheduled_date, start_time, status, workflow_template_id, current_step_key, current_step_order, progress_pct, customers(name), vehicles(maker, model, plate_display), workflow_templates(steps), reservation_step_logs(step_order, step_label, started_at, completed_at)",
      )
      .eq("tenant_id", caller.tenantId)
      .in("status", WATCH_ACTIVE_STATUSES)
      .or(`scheduled_date.eq.${date},status.eq.in_progress`)
      .order("scheduled_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(30);

    if (storeId) query = query.eq("store_id", storeId);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "mobile.watch.today");

    const jobs = ((data ?? []) as unknown as WatchReservationRow[])
      .map((row) => toWatchJob(row))
      .filter((job): job is NonNullable<typeof job> => job !== null)
      .sort((a, b) => {
        const priority = { in_progress: 0, arrived: 1, confirmed: 2 } as const;
        return (
          priority[a.status] - priority[b.status] || (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99")
        );
      });

    return apiOk({ date, jobs });
  } catch (error) {
    return apiInternalError(error, "mobile.watch.today");
  }
}
