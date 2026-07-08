/**
 * 受けられる日程候補の提案ロジック（純粋関数）。
 *
 * 予約内容（作業内容 → 所要時間）・受付スロット・定休日・既存予約・代車の空きを
 * 突き合わせ、「この作業を受けられる日時候補」を算出する。副作用なしでユニットテスト
 * 可能にし、データ取得は呼び出し側（API）に委ねる。
 *
 * ponytail: 1候補=1スロット始点までに割り切る（所要時間がスロット長を超える作業は
 * `fits=false` を返すのみで、複数スロットにまたがる自動連結はしない）。連結が必要に
 * なったら daySlots を時間順に走査して連続空きを結合する処理をここに足す。
 */

import { timeToMinutes, minutesToTime } from "./slots";

export type CandidateWeeklySlot = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  max_bookings: number;
};

export type CandidateClosedDay = {
  type: "weekly" | "specific";
  day_of_week?: number | null;
  closed_date?: string | null;
};

export type CandidateReservation = {
  scheduled_date: string;
  start_time: string;
  end_time: string;
};

export type Candidate = {
  date: string;
  day_of_week: number;
  start_time: string;
  /** 所要時間を反映した終了時刻（見積り不能ならスロット終了）。 */
  end_time: string;
  /** スロット自体の終了時刻。 */
  slot_end: string;
  /** そのスロットの残受付可能数。 */
  remaining: number;
  /** 所要時間がこのスロット長に収まるか。見積り不能なら true。 */
  fits: boolean;
  /** その日に空いている代車台数。needsLoaner でないときは null。 */
  loaner_free: number | null;
};

export interface ProposeCandidatesOptions {
  /** 評価対象の日付（YYYY-MM-DD）。並び順そのままに評価する。 */
  dates: string[];
  slots: CandidateWeeklySlot[];
  closedDays: CandidateClosedDay[];
  reservations: CandidateReservation[];
  /** 作業所要時間（分）。null なら所要時間フィルタはかけず fits=true 扱い。 */
  estimatedMinutes: number | null;
  /** 代車必須か。true なら空き代車0の日は候補にしない。 */
  needsLoaner?: boolean;
  /** 日付ごとの空き代車台数（needsLoaner 時に参照）。 */
  freeLoanersByDate?: Record<string, number>;
  /** 返す候補数の上限（既定 20）。 */
  limit?: number;
}

/** date 文字列（YYYY-MM-DD）→ 曜日 0(日)〜6(土)。ローカル正午基準で TZ 揺れを避ける。 */
function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0).getDay();
}

export function proposeCandidates(opts: ProposeCandidatesOptions): Candidate[] {
  const { dates, slots, closedDays, reservations, estimatedMinutes } = opts;
  const needsLoaner = opts.needsLoaner ?? false;
  const freeLoanersByDate = opts.freeLoanersByDate ?? {};
  const limit = opts.limit ?? 20;

  const weeklyClosed = new Set<number>();
  const specificClosed = new Set<string>();
  for (const cd of closedDays) {
    if (cd.type === "weekly" && cd.day_of_week != null) weeklyClosed.add(cd.day_of_week);
    else if (cd.type === "specific" && cd.closed_date) specificClosed.add(cd.closed_date);
  }

  // 曜日ごとの有効スロット（開始時刻順）
  const slotsByDow: Record<number, CandidateWeeklySlot[]> = {};
  for (const s of slots) {
    (slotsByDow[s.day_of_week] ??= []).push(s);
  }
  for (const dow of Object.keys(slotsByDow)) {
    slotsByDow[Number(dow)].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  }

  // 日付ごとの予約（重複カウント用）
  const resvByDate: Record<string, CandidateReservation[]> = {};
  for (const r of reservations) {
    (resvByDate[r.scheduled_date] ??= []).push(r);
  }

  const out: Candidate[] = [];
  for (const date of dates) {
    if (out.length >= limit) break;
    if (specificClosed.has(date)) continue;
    const dow = weekdayOf(date);
    if (weeklyClosed.has(dow)) continue;

    const daySlots = slotsByDow[dow];
    if (!daySlots || daySlots.length === 0) continue;

    // 代車必須なのに空きが無い日はスキップ
    const loanerFree = needsLoaner ? (freeLoanersByDate[date] ?? 0) : null;
    if (needsLoaner && (loanerFree ?? 0) <= 0) continue;

    const dayResv = resvByDate[date] ?? [];
    for (const slot of daySlots) {
      if (out.length >= limit) break;
      const slotStart = timeToMinutes(slot.start_time);
      const slotEnd = timeToMinutes(slot.end_time);
      // 排他境界で重なる予約数（空き状況 GET / 満席判定と同じ規則）
      const booked = dayResv.filter(
        (r) => timeToMinutes(r.start_time) < slotEnd && timeToMinutes(r.end_time) > slotStart,
      ).length;
      const remaining = slot.max_bookings - booked;
      if (remaining <= 0) continue;

      const fits = estimatedMinutes == null ? true : slotEnd - slotStart >= estimatedMinutes;
      const endMin = estimatedMinutes == null ? slotEnd : Math.min(slotStart + estimatedMinutes, slotEnd);

      out.push({
        date,
        day_of_week: dow,
        start_time: minutesToTime(slotStart),
        end_time: minutesToTime(endMin),
        slot_end: minutesToTime(slotEnd),
        remaining,
        fits,
        loaner_free: loanerFree,
      });
    }
  }
  return out;
}
