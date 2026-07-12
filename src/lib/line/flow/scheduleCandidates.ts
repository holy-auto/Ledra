/**
 * 会話フローから使う日程候補の取得 (Phase 1b-3)。
 *
 * `/api/admin/booking-candidates` と同じ純粋関数 (proposeCandidates) を、
 * service-role で簡易にデータ取得して呼ぶ。LINE 会話では確定した品目 ID を
 * 持たないため所要時間フィルタはかけない (estimatedMinutes=null → 全枠 fits=true)。
 *
 * ponytail: 代車必須判定・人手判定は行わない (顧客にまだ「代車が要るか」を確認して
 * いないため)。Phase 2 でオプション確認時に代車要否を聞けるようになったら
 * needsLoaner / considerStaff を渡す (booking-candidates route と同じ配線)。
 */
import { proposeCandidates, type Candidate } from "@/lib/booking/candidates";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

export interface FlowScheduleCandidate {
  date: string;
  start_time: string;
  end_time: string;
}

/** YYYY-MM-DD をローカル正午基準で n 日進める (booking-candidates/route.ts と同じ実装)。 */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function todayYmd(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/**
 * 受付可能な日程候補を最大 `limit` 件返す。
 * `restrictToDate` を渡すと、その日 1 日だけを対象に再判定する
 * (スロット選択時の直前再検証用)。取得失敗時は空配列 (fail-soft)。
 */
export async function fetchFlowScheduleCandidates(
  admin: Admin,
  tenantId: string,
  opts: { limit?: number; days?: number; restrictToDate?: string } = {},
): Promise<FlowScheduleCandidate[]> {
  const limit = opts.limit ?? 3;
  const days = opts.days ?? 14;
  const dates = opts.restrictToDate
    ? [opts.restrictToDate]
    : Array.from({ length: days }, (_, i) => addDays(todayYmd(), i));
  const from = dates[0];
  const to = dates[dates.length - 1];

  const [slotsRes, closedRes, resvRes] = await Promise.all([
    admin
      .from("external_booking_slots")
      .select("day_of_week, start_time, end_time, max_bookings, accepted_categories")
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
    admin.from("closed_days").select("type, day_of_week, closed_date").eq("tenant_id", tenantId),
    admin
      .from("reservations")
      .select("scheduled_date, start_time, end_time")
      .eq("tenant_id", tenantId)
      .neq("status", "cancelled")
      .gte("scheduled_date", from)
      .lte("scheduled_date", to),
  ]);
  if (slotsRes.error || closedRes.error || resvRes.error) return [];

  const candidates: Candidate[] = proposeCandidates({
    dates,
    slots: (slotsRes.data as ProposeSlotRow[] | null) ?? [],
    closedDays: (closedRes.data as ProposeClosedRow[] | null) ?? [],
    reservations: (resvRes.data as ProposeReservationRow[] | null) ?? [],
    estimatedMinutes: null,
    limit,
  });
  return candidates.map((c) => ({ date: c.date, start_time: c.start_time, end_time: c.end_time }));
}

type ProposeSlotRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  max_bookings: number;
  accepted_categories: string[] | null;
};
type ProposeClosedRow = { type: "weekly" | "specific"; day_of_week?: number | null; closed_date?: string | null };
type ProposeReservationRow = { scheduled_date: string; start_time: string; end_time: string };
