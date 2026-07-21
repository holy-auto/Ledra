import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { proposeCandidates, type CandidateReservation } from "@/lib/booking/candidates";
import { mergeHoldsIntoReservations } from "@/lib/booking/holds";
import { addDays } from "@/lib/booking/slots";
import { todayJst } from "@/lib/gantt/board";
import { partnerCanViewAvailability } from "@/lib/partners/availabilityGate";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  partner_tenant_id: z.string().uuid(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  category: z.string().trim().max(80).optional(),
});

/**
 * GET /api/admin/partners/availability?partner_tenant_id=&from=&to=&category=
 * 取引先(partner_tenant_id=B)の空き枠を返す。呼び出し元 A が B の取引先として
 * 空き公開を許可されている場合のみ（partnerCanViewAvailability）。
 * 有効な仮押さえ(reservation_holds)も占有として合算した残数を返す。
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = querySchema.safeParse({
      partner_tenant_id: req.nextUrl.searchParams.get("partner_tenant_id") ?? "",
      from: req.nextUrl.searchParams.get("from") ?? undefined,
      to: req.nextUrl.searchParams.get("to") ?? undefined,
      category: req.nextUrl.searchParams.get("category") ?? undefined,
    });
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid query");
    }
    const { partner_tenant_id: partnerId, category } = parsed.data;

    // 取引先ゲート
    const allowed = await partnerCanViewAvailability(caller.tenantId, partnerId);
    if (!allowed) return apiForbidden("この取引先の空きは閲覧できません（先方の取引先登録・空き公開が必要です）");

    // 日付範囲（既定: 今日から14日、上限31日）
    const now = new Date();
    const from = parsed.data.from ?? todayJst(now);
    let to = parsed.data.to ?? addDays(from, 14);
    // 上限クランプ
    const maxTo = addDays(from, 31);
    if (to > maxTo) to = maxTo;
    if (to < from) to = from;

    const dates: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      dates.push(d);
      if (dates.length > 32) break;
    }

    const admin = createPlatformScopedAdmin(
      "partners/availability: 取引先(B)の空き枠計算 (テナント跨ぎ読取・app 層で取引先認可)",
    );

    const [slotsRes, closedRes, resvRes, holdsRes] = await Promise.all([
      admin
        .from("external_booking_slots")
        .select("day_of_week, start_time, end_time, max_bookings, accepted_categories")
        .eq("tenant_id", partnerId)
        .eq("is_active", true),
      admin.from("closed_days").select("type, day_of_week, closed_date").eq("tenant_id", partnerId),
      admin
        .from("reservations")
        .select("scheduled_date, start_time, end_time, all_day")
        .eq("tenant_id", partnerId)
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .neq("status", "cancelled"),
      admin
        .from("reservation_holds")
        .select("scheduled_date, start_time, end_time, status, expires_at")
        .eq("tenant_id", partnerId)
        .eq("status", "pending")
        .gte("scheduled_date", from)
        .lte("scheduled_date", to),
    ]);

    const reservations = (resvRes.data ?? []) as CandidateReservation[];
    const occupants = mergeHoldsIntoReservations(reservations, holdsRes.data ?? [], now);

    const candidates = proposeCandidates({
      dates,
      slots: slotsRes.data ?? [],
      closedDays: closedRes.data ?? [],
      reservations: occupants,
      estimatedMinutes: null,
      workCategories: category ? [category] : [],
      limit: 60,
    });

    return apiJson({ candidates, from, to });
  } catch (e: unknown) {
    return apiInternalError(e, "partners availability GET");
  }
}
