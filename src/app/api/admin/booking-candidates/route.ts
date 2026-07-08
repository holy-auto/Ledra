import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";
import { estimateReservationMinutes } from "@/lib/booths/duration";
import { proposeCandidates } from "@/lib/booking/candidates";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  // カンマ区切りの品目ID（所要時間の見積り元）。空でも可。
  menu_item_ids: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)),
    ),
  // 見積り分を直接指定する場合（品目未選択でも所要時間フィルタしたいとき）。
  estimated_minutes: z.coerce
    .number()
    .int()
    .min(0)
    .max(60 * 24)
    .optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  days: z.coerce.number().int().min(1).max(60).default(14),
  needs_loaner: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** YYYY-MM-DD をローカル正午基準で n 日進める。 */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/**
 * GET /api/admin/booking-candidates
 *
 * 作業内容（品目=所要時間）・受付スロット・定休日・既存予約・代車の空きを突き合わせ、
 * 「受けられる日程候補」を提案する。
 *
 * Query:
 *   menu_item_ids?   カンマ区切りの品目ID（所要時間の見積り元）
 *   estimated_minutes? 所要時間を直接指定（menu_item_ids より優先）
 *   from?            起点日 YYYY-MM-DD（既定: 今日）
 *   days?            起点から何日ぶんを走査するか（既定 14, 最大 60）
 *   needs_loaner?    "1"/"true" で代車必須（空き代車0の日を除外）
 *   limit?           返す候補数上限（既定 20）
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid query");
    }
    const {
      menu_item_ids: menuItemIds,
      estimated_minutes: estimatedOverride,
      days,
      needs_loaner: needsLoaner,
      limit,
    } = parsed.data;
    const tenantId = caller.tenantId;

    // 起点日（既定: 今日 / サーバTZ）。走査対象日を配列化。
    const today = new Date();
    const from =
      parsed.data.from ??
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
    const to = dates[dates.length - 1];

    // ── 並列取得: 品目 / スロット / 定休日 / 予約 / 代車 / 貸出 ──
    const [menuRes, slotsRes, closedRes, resvRes, loanersRes, loansRes] = await Promise.all([
      menuItemIds.length > 0
        ? supabase.from("menu_items").select("estimated_minutes").eq("tenant_id", tenantId).in("id", menuItemIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("external_booking_slots")
        .select("day_of_week, start_time, end_time, max_bookings")
        .eq("tenant_id", tenantId)
        .eq("is_active", true),
      supabase.from("closed_days").select("type, day_of_week, closed_date").eq("tenant_id", tenantId),
      supabase
        .from("reservations")
        .select("scheduled_date, start_time, end_time")
        .eq("tenant_id", tenantId)
        .neq("status", "cancelled")
        .gte("scheduled_date", from)
        .lte("scheduled_date", to),
      supabase.from("loaner_cars").select("id").eq("tenant_id", tenantId).eq("is_active", true),
      needsLoaner
        ? supabase.from("loaner_car_loans").select("return_due_at").eq("tenant_id", tenantId).is("returned_at", null)
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const r of [menuRes, slotsRes, closedRes, resvRes, loanersRes, loansRes]) {
      if (r.error) {
        console.error("[booking-candidates] query error:", r.error.message);
        return apiInternalError(r.error, "booking-candidates");
      }
    }

    // 所要時間: estimated_minutes 直接指定 > 品目合計。
    const estimatedMinutes =
      estimatedOverride ?? estimateReservationMinutes((menuRes.data ?? []) as { estimated_minutes: number | null }[]);

    // 代車の空き台数（日別）。貸出中で返却予定日が対象日以降（または無期限）なら不在扱い。
    // ponytail: 将来日の代車予約は別モデル化されていないため、現在の未返却貸出の返却予定で近似。
    let freeLoanersByDate: Record<string, number> | undefined;
    if (needsLoaner) {
      const loanerTotal = (loanersRes.data ?? []).length;
      const dueDates = (loansRes.data ?? []).map((l: { return_due_at: string | null }) =>
        l.return_due_at ? l.return_due_at.slice(0, 10) : null,
      );
      freeLoanersByDate = {};
      for (const date of dates) {
        const out = dueDates.filter((due) => due === null || due >= date).length;
        freeLoanersByDate[date] = Math.max(0, loanerTotal - out);
      }
    }

    const candidates = proposeCandidates({
      dates,
      slots: (slotsRes.data ?? []) as {
        day_of_week: number;
        start_time: string;
        end_time: string;
        max_bookings: number;
      }[],
      closedDays: (closedRes.data ?? []) as {
        type: "weekly" | "specific";
        day_of_week?: number | null;
        closed_date?: string | null;
      }[],
      reservations: (resvRes.data ?? []) as {
        scheduled_date: string;
        start_time: string;
        end_time: string;
      }[],
      estimatedMinutes,
      needsLoaner,
      freeLoanersByDate,
      limit,
    });

    return apiJson({
      estimated_minutes: estimatedMinutes,
      loaner_total: (loanersRes.data ?? []).length,
      needs_loaner: needsLoaner,
      from,
      days,
      candidates,
    });
  } catch (e) {
    return apiInternalError(e, "booking-candidates");
  }
}
