/**
 * 会話フローから使う日程候補の取得 (Phase 1b-3)。
 *
 * `/api/admin/booking-candidates` と同じ純粋関数 (proposeCandidates) を、
 * service-role で簡易にデータ取得して呼ぶ。
 *
 * 見積り（新規予約）フローは確定した品目 ID を持たないため所要時間・代車・カテゴリは
 * 不明なまま (estimatedMinutes=null → 全枠 fits=true)。一方、日程変更フローは動かす対象の
 * 既存予約から実所要時間 (end−start) と代車要否 (loaner_car_id) が判るので、呼び出し側が
 * `estimatedMinutes` / `needsLoaner` / `excludeRestricted` を渡して精度を上げる。
 *
 * ponytail: 人手判定 (considerStaff) は行わない。天井: 見積りフローでは受入カテゴリ制限枠にも
 * 候補が出うる／所要時間不明なため end_time が枠の終了時刻になる (実作業時間ではない)。
 * 見積りフローで施工内容→品目→カテゴリ/所要時間を解決できるようになったら同様に渡す。
 */
import { proposeCandidates, computeFreeLoanersByDate, type Candidate } from "@/lib/booking/candidates";
import { addDays, timeToMinutes } from "@/lib/booking/slots";
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
 * 予約の実所要時間(分)。start/end が揃っていて end>start のときだけ返す。
 * 終日・時刻未設定・逆転は null (= 所要時間フィルタをかけない)。
 */
export function reservationDurationMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const d = timeToMinutes(end) - timeToMinutes(start);
  return d > 0 ? d : null;
}

/**
 * 受付可能な日程候補を最大 `limit` 件返す。
 * `restrictToDate` を渡すと、その日 1 日だけを対象に再判定する
 * (スロット選択時の直前再検証用)。`fromDate` を渡すと候補の起点日を差し替える
 * (既定は今日。日程変更は「前日まで」= 当日への変更を避けるため翌日起点を渡す)。
 * `excludeReservationId` を渡すと、その予約を空き計算から除外する (日程変更で、動かす対象の
 * 予約が自分自身の枠を占有したまま数えられて候補が過少に見えるのを防ぐ)。
 * `estimatedMinutes` を渡すと所要時間に収まらない枠を除外し、候補の end_time を実作業時間
 * (start+所要) に揃える (日程変更で元予約の長さを保つ)。`needsLoaner` を渡すと空き代車0の日を
 * 除外する。`excludeRestricted` を渡すと受入カテゴリ制限のある枠を除外する (作業はあるが
 * カテゴリ不明なとき、無関係な制限枠を提案しない)。取得失敗時は空配列 (fail-soft)。
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
    estimatedMinutes?: number | null;
    needsLoaner?: boolean;
    excludeRestricted?: boolean;
  } = {},
): Promise<FlowScheduleCandidate[]> {
  const limit = opts.limit ?? 3;
  const days = opts.days ?? 14;
  const needsLoaner = opts.needsLoaner ?? false;
  const base = opts.fromDate ?? todayYmd();
  const dates = opts.restrictToDate ? [opts.restrictToDate] : Array.from({ length: days }, (_, i) => addDays(base, i));
  const from = dates[0];
  const to = dates[dates.length - 1];

  let resvQuery = admin
    .from("reservations")
    // all_day も取得する: 終日予約はその日の全枠を占有するが、未取得だと proposeCandidates の
    // 占有判定 (r.all_day || 時間帯重複) をすり抜けて満杯の日に候補が出てしまう
    // (二重予約。canonical な booking-candidates route と同じ理由で all_day を含める)。
    // loaner_car_id は needsLoaner 時の空き代車計算に使う。
    .select("scheduled_date, start_time, end_time, all_day, loaner_car_id")
    .eq("tenant_id", tenantId)
    .neq("status", "cancelled")
    .gte("scheduled_date", from)
    .lte("scheduled_date", to);
  // 日程変更中は、動かす対象の予約を空き計算から除外する (自分の枠に自分がぶつからないように)。
  if (opts.excludeReservationId) resvQuery = resvQuery.neq("id", opts.excludeReservationId);

  const [slotsRes, closedRes, resvRes, loanersRes, loansRes] = await Promise.all([
    admin
      .from("external_booking_slots")
      .select("day_of_week, start_time, end_time, max_bookings, accepted_categories")
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
    admin.from("closed_days").select("type, day_of_week, closed_date").eq("tenant_id", tenantId),
    resvQuery,
    // 代車在庫は needsLoaner 時のみ取得 (それ以外は空きの計算自体をしない)。
    needsLoaner
      ? admin.from("loaner_cars").select("id").eq("tenant_id", tenantId).eq("is_active", true)
      : Promise.resolve({ data: [], error: null }),
    needsLoaner
      ? admin
          .from("loaner_car_loans")
          .select("loaner_car_id, return_due_at")
          .eq("tenant_id", tenantId)
          .is("returned_at", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (slotsRes.error || closedRes.error || resvRes.error || loanersRes.error || loansRes.error) return [];

  const reservations = (resvRes.data as ProposeReservationRow[] | null) ?? [];
  const freeLoanersByDate = needsLoaner
    ? computeFreeLoanersByDate(
        dates,
        new Set(((loanersRes.data as { id: string }[] | null) ?? []).map((r) => r.id)),
        reservations,
        (loansRes.data as { loaner_car_id: string; return_due_at: string | null }[] | null) ?? [],
      )
    : undefined;

  const candidates: Candidate[] = proposeCandidates({
    dates,
    slots: (slotsRes.data as ProposeSlotRow[] | null) ?? [],
    closedDays: (closedRes.data as ProposeClosedRow[] | null) ?? [],
    reservations,
    estimatedMinutes: opts.estimatedMinutes ?? null,
    excludeRestricted: opts.excludeRestricted ?? false,
    needsLoaner,
    freeLoanersByDate,
    // 顧客向けなので所要時間に入らない枠は提示しない。onlyFitting により fits=false は limit
    // 集計より前に除外される (短い枠が先に limit を食い潰して入る枠を取りこぼすのを防ぐ)。
    // estimatedMinutes 未指定なら全 fits=true なので無害。
    onlyFitting: true,
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
type ProposeReservationRow = {
  scheduled_date: string;
  start_time: string;
  end_time: string;
  all_day?: boolean | null;
  loaner_car_id?: string | null;
};
