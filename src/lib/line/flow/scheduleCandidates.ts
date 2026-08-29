/**
 * 会話フローから使う日程候補の取得 (Phase 1b-3)。
 *
 * `/api/admin/booking-candidates` と同じ純粋関数 (proposeCandidates) を、
 * service-role で簡易にデータ取得して呼ぶ。LINE 会話では確定した品目 ID を
 * 持たないため所要時間フィルタはかけない (estimatedMinutes=null → 全枠 fits=true)。
 *
 * ponytail: 代車必須判定・人手判定・作業カテゴリ絞り込み (needsLoaner /
 * considerStaff / workCategories) は行わない (顧客にまだ「代車が要るか」「どの
 * カテゴリの作業か」を確認していないため)。天井: 受入カテゴリ制限のある枠にも
 * 候補が出うる／所要時間が不明なため候補・予約の end_time は枠の終了時刻そのもの
 * になる (実作業時間ではない)。Phase 2 でオプション確認時にこれらを聞けるように
 * なったら needsLoaner / considerStaff / workCategories / estimatedMinutes を渡す
 * (booking-candidates route と同じ配線)。
 */
import { proposeCandidates, type Candidate } from "@/lib/booking/candidates";
import { addDays } from "@/lib/booking/slots";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

export interface FlowScheduleCandidate {
  date: string;
  start_time: string;
  end_time: string;
}

function todayYmd(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/**
 * 受付可能な日程候補を最大 `limit` 件返す。
 * `restrictToDate` を渡すと、その日 1 日だけを対象に再判定する
 * (スロット選択時の直前再検証用)。`fromDate` を渡すと候補の起点日を差し替える
 * (既定は今日。日程変更は「前日まで」= 当日への変更を避けるため翌日起点を渡す)。
 * `excludeReservationId` を渡すと、その予約を空き計算から除外する (日程変更で、動かす対象の
 * 予約が自分自身の枠を占有したまま数えられて候補が過少に見えるのを防ぐ)。
 * 取得失敗時は空配列 (fail-soft)。
 */
export async function fetchFlowScheduleCandidates(
  admin: Admin,
  tenantId: string,
  opts: {
    limit?: number;
    days?: number;
    restrictToDate?: string;
    fromDate?: string;
    excludeReservationId?: string;
  } = {},
): Promise<FlowScheduleCandidate[]> {
  const limit = opts.limit ?? 3;
  const days = opts.days ?? 14;
  const base = opts.fromDate ?? todayYmd();
  const dates = opts.restrictToDate ? [opts.restrictToDate] : Array.from({ length: days }, (_, i) => addDays(base, i));
  const from = dates[0];
  const to = dates[dates.length - 1];

  let resvQuery = admin
    .from("reservations")
    .select("scheduled_date, start_time, end_time")
    .eq("tenant_id", tenantId)
    .neq("status", "cancelled")
    .gte("scheduled_date", from)
    .lte("scheduled_date", to);
  // 日程変更中は、動かす対象の予約を空き計算から除外する (自分の枠に自分がぶつからないように)。
  if (opts.excludeReservationId) resvQuery = resvQuery.neq("id", opts.excludeReservationId);

  const [slotsRes, closedRes, resvRes] = await Promise.all([
    admin
      .from("external_booking_slots")
      .select("day_of_week, start_time, end_time, max_bookings, accepted_categories")
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
    admin.from("closed_days").select("type, day_of_week, closed_date").eq("tenant_id", tenantId),
    resvQuery,
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
