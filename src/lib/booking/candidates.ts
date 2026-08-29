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
  /** 受け入れる作業の大カテゴリ。null/空=すべて受入。 */
  accepted_categories?: string[] | null;
};

export type CandidateClosedDay = {
  type: "weekly" | "specific";
  day_of_week?: number | null;
  closed_date?: string | null;
};

export type CandidateReservation = {
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  /** 終日予約。true ならその日のすべての枠を占有する。 */
  all_day?: boolean | null;
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
  /** このスロットが受け入れる作業の大カテゴリ。null=すべて受入。 */
  accepted_categories: string[] | null;
  /** その時間帯の空き人手（在籍スタッフ数 − 同時間帯の予約数）。考慮しないときは null。 */
  staff_free: number | null;
};

export interface ProposeCandidatesOptions {
  /** 評価対象の日付（YYYY-MM-DD）。並び順そのままに評価する。 */
  dates: string[];
  slots: CandidateWeeklySlot[];
  closedDays: CandidateClosedDay[];
  reservations: CandidateReservation[];
  /** 作業所要時間（分）。null なら所要時間フィルタはかけず fits=true 扱い。 */
  estimatedMinutes: number | null;
  /** 予約する作業の大カテゴリ。指定時、受け入れないスロットは候補から除外する。空=絞らない。 */
  workCategories?: string[];
  /**
   * 作業カテゴリが不明（workCategories 空）なとき、受入制限のある枠を除外するか。
   * 工程テンプレのみ指定で品目カテゴリが取れない場合など、無関係な制限枠を推薦しないために使う。
   */
  excludeRestricted?: boolean;
  /** 代車必須か。true なら空き代車0の日は候補にしない。 */
  needsLoaner?: boolean;
  /** 日付ごとの空き代車台数（needsLoaner 時に参照）。 */
  freeLoanersByDate?: Record<string, number>;
  /** 人手の余りを考慮するか。true かつ その日のシフトが判る場合、空き人手0以下の枠を除外。 */
  considerStaff?: boolean;
  /**
   * 日付ごとの勤務シフト（分単位。start/end が null なら終日勤務扱い）。
   * considerStaff 時に参照。エントリの無い日は「不明」として人手フィルタをかけない。
   * スロット時間帯を実際にカバーするスタッフのみを在籍としてカウントする。
   */
  staffShiftsByDate?: Record<string, Array<{ staffId: string; start: number | null; end: number | null }>>;
  /**
   * 所要時間に収まらない枠 (fits=false) を候補に含めない。既定 false (管理UIは「入らない枠」も
   * 表示して fits で示すため)。true にすると fits=false の枠を limit 集計より前に除外するので、
   * 短い枠が先に limit を食い潰して後続の入る枠が取りこぼされるのを防ぐ (顧客向け提示で使う)。
   */
  onlyFitting?: boolean;
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
  const considerStaff = opts.considerStaff ?? false;
  const staffShiftsByDate = opts.staffShiftsByDate ?? {};
  const excludeRestricted = opts.excludeRestricted ?? false;
  const onlyFitting = opts.onlyFitting ?? false;
  const limit = opts.limit ?? 20;

  // 指定スロット [start,end) をカバーするシフトの、在籍スタッフ実人数（重複除去）。
  const staffCoveringSlot = (date: string, slotStart: number, slotEnd: number): number => {
    const ids = new Set<string>();
    for (const sh of staffShiftsByDate[date] ?? []) {
      const covers = (sh.start == null || sh.start <= slotStart) && (sh.end == null || sh.end >= slotEnd);
      if (covers) ids.add(sh.staffId);
    }
    return ids.size;
  };
  const workCategories = new Set((opts.workCategories ?? []).filter((c) => c));

  // スロットが対象作業を受け入れるか。受入カテゴリ未設定=すべて受入。作業カテゴリ未指定=絞らない。
  // 複数カテゴリの作業（例: 洗車+コーティング）は、その全カテゴリを受け入れる枠のみ可
  // （1つでも受け入れない枠だと作業一式を完了できないため）。
  const slotAccepts = (accepted: string[] | null | undefined): boolean => {
    if (!accepted || accepted.length === 0) return true; // 受入制限なしは常に可
    if (workCategories.size === 0) return !excludeRestricted; // カテゴリ不明: 制限枠を出すか
    const acceptedSet = new Set(accepted);
    return [...workCategories].every((c) => acceptedSet.has(c));
  };

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
      if (!slotAccepts(slot.accepted_categories)) continue;
      const slotStart = timeToMinutes(slot.start_time);
      const slotEnd = timeToMinutes(slot.end_time);
      // 排他境界で重なる予約数（空き状況 GET / 満席判定と同じ規則）。
      // 終日予約はその日のすべての枠を占有する。時刻未設定の非終日行は数えない。
      const booked = dayResv.filter(
        (r) =>
          r.all_day ||
          (r.start_time != null &&
            r.end_time != null &&
            timeToMinutes(r.start_time) < slotEnd &&
            timeToMinutes(r.end_time) > slotStart),
      ).length;
      let remaining = slot.max_bookings - booked;
      if (remaining <= 0) continue;

      const fits = estimatedMinutes == null ? true : slotEnd - slotStart >= estimatedMinutes;
      // 入らない枠を出さない指定のときは、push (=limit 集計) より前に除外する。
      // これをしないと短い枠が先に limit を食い潰し、後続の入る枠が取りこぼされる。
      if (onlyFitting && !fits) continue;
      // 候補の実際の終了時刻（所要時間ぶん）。人手判定もこの実作業時間帯で見る。
      const endMin = estimatedMinutes == null ? slotEnd : Math.min(slotStart + estimatedMinutes, slotEnd);

      // 人手の余り: 実作業時間帯 [slotStart, endMin) をカバーする在籍スタッフ数 −
      // その時間帯に重なる予約数。0以下なら受入不可。シフト未登録の日は人手フィルタをかけない。
      // 予約数もスロット全体でなく実作業時間で数える（例: 短時間作業が長い枠でも、実作業時間に
      // 重ならない既存予約は人手を消費しない）。
      let staffFree: number | null = null;
      if (considerStaff && date in staffShiftsByDate) {
        const bookedInWindow = dayResv.filter(
          (r) =>
            r.all_day ||
            (r.start_time != null &&
              r.end_time != null &&
              timeToMinutes(r.start_time) < endMin &&
              timeToMinutes(r.end_time) > slotStart),
        ).length;
        staffFree = staffCoveringSlot(date, slotStart, endMin) - bookedInWindow;
        if (staffFree <= 0) continue;
        remaining = Math.min(remaining, staffFree);
      }

      out.push({
        date,
        day_of_week: dow,
        start_time: minutesToTime(slotStart),
        end_time: minutesToTime(endMin),
        slot_end: minutesToTime(slotEnd),
        remaining,
        fits,
        loaner_free: loanerFree,
        accepted_categories: slot.accepted_categories ?? null,
        staff_free: staffFree,
      });
    }
  }
  return out;
}

/**
 * 日付ごとの空き代車台数を算出する（純粋関数）。押さえ済み = ①その日の未キャンセル予約に
 * 割り当てられた稼働代車 ＋ ②現在貸出中（未返却）で返却予定日が対象日以降（または無期限）の代車。
 * `proposeCandidates({ needsLoaner:true, freeLoanersByDate })` にそのまま渡せる形で返す。
 * booking-candidates route と LINE 会話フロー（日程変更）で同一の在庫計算を共有するための単一情報源。
 */
export function computeFreeLoanersByDate(
  dates: string[],
  activeLoanerIds: Set<string> | Iterable<string>,
  reservations: Array<{ scheduled_date: string; loaner_car_id?: string | null }>,
  openLoans: Array<{ loaner_car_id: string; return_due_at: string | null }>,
): Record<string, number> {
  const active = activeLoanerIds instanceof Set ? activeLoanerIds : new Set(activeLoanerIds);
  const total = active.size;

  // ① 予約割当（日別）: date → その日に押さえられている稼働代車ID
  const assignedByDate = new Map<string, Set<string>>();
  for (const r of reservations) {
    if (!r.loaner_car_id || !active.has(r.loaner_car_id)) continue;
    const key = r.scheduled_date.slice(0, 10);
    let set = assignedByDate.get(key);
    if (!set) assignedByDate.set(key, (set = new Set()));
    set.add(r.loaner_car_id);
  }
  // ② 現在貸出中（未返却）: {代車ID, 返却予定日}
  const loans = openLoans.map((l) => ({
    id: l.loaner_car_id,
    due: l.return_due_at ? l.return_due_at.slice(0, 10) : null,
  }));

  const out: Record<string, number> = {};
  for (const date of dates) {
    const committed = new Set(assignedByDate.get(date) ?? []);
    for (const l of loans) {
      if (active.has(l.id) && (l.due === null || l.due >= date)) committed.add(l.id);
    }
    out[date] = Math.max(0, total - committed.size);
  }
  return out;
}
