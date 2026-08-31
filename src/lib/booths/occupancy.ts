/**
 * ブース占有予測・稼働率計算（IMP-041）。
 *
 * BoothsClient.tsx の maxConcurrent() はクライアント UI 内の private 関数として残し、
 * サーバー側・分析側で再利用可能な占有計算ロジックを純関数で提供する。
 *
 * IMP-044（NEXT ACTION エンジン）と IMP-046（経営分析 KPI）の前提条件。
 * DB・API・UI の変更なし（型基盤先行パターン）。
 */
import { parseTimeToHours, SHIFT_START, SHIFT_END } from "@/lib/gantt/board";

/**
 * ブースを占有しない終端ステータス。
 * cancelled は toEvents で除外。completed/no_show は「作業終了 → ブースは空き」。
 * computeBoothUtilization は完了作業も稼働実績に含めるため、この定数は使わない
 * （no_show だけを別途除外する。下記コメント参照）。
 *
 * boothSignals.ts でも同じ判定が必要なため export する（重複定義を避ける）。
 */
export const NON_OCCUPYING = new Set(["cancelled", "completed", "no_show"]);

/**
 * 稼働率計算から除外するステータス。
 * NON_OCCUPYING と違い completed は含めない — 完了作業は実際にブースを
 * 使った実績なので稼働率にはカウントする。no_show は実際には来店せず
 * ブースを使っていないので除外する（cancelled は toEvents 側で除外済み）。
 */
const NOT_ACTUAL_WORK = new Set(["no_show"]);

/**
 * 稼働率計算（completed は稼働実績に含める）における除外ステータス。
 * computeBoothUtilization は NOT_ACTUAL_WORK でフィルタした後 toEvents 内部で
 * cancelled を別途除外するが、toEvents を経由しない呼び出し元
 * （capacityAnalytics.ts の decomposeTimeBands 等）が同じ判定をしたい場合は
 * cancelled も合わせて除外する必要があるため、この定数を使う。
 */
export const UTILIZATION_EXCLUDED = new Set([...NOT_ACTUAL_WORK, "cancelled"]);

// ── 入力型 ──

export interface BoothReservation {
  id: string;
  boothId: string;
  startTime: string | null; // "HH:MM"
  endTime: string | null; // "HH:MM"
  estimatedMinutes: number | null;
  status: string;
}

export interface BoothInfo {
  id: string;
  name: string;
  boothType: string | null;
  capacity: number;
  isActive: boolean;
}

// ── 結果型 ──

export interface CapacityConflict {
  boothId: string;
  /** 超過が発生する時間帯（時単位、例: {start: 9, end: 12.5}） */
  window: { start: number; end: number };
  /** ピーク同時予約数 */
  peakConcurrent: number;
  capacity: number;
  /** 当該時間帯に重なる予約 ID */
  reservationIds: string[];
}

export interface BoothUtilization {
  boothId: string;
  /** 予約で埋まっている分（分単位） */
  occupiedMinutes: number;
  /** 営業時間の総分 */
  totalMinutes: number;
  /** 稼働率 (0–100) */
  utilizationPct: number;
  /** 同時占有のピーク */
  peakConcurrent: number;
}

export interface FreeSlot {
  start: number; // 時（例 9.5 = 09:30）
  end: number;
}

export interface BoothAvailability {
  boothId: string;
  boothName: string;
  boothType: string | null;
  /** 空き時間帯のリスト */
  freeSlots: FreeSlot[];
  /** 指定時刻に空いているか */
  currentlyFree: boolean;
}

// ── ヘルパ ──

interface TimeEvent {
  time: number;
  delta: 1 | -1;
  reservationId: string;
}

/** 予約リストからスイープライン用イベントを生成。時間未設定は終日扱い。 */
function toEvents(
  reservations: readonly BoothReservation[],
  shiftStart: number,
  shiftEnd: number,
): { events: TimeEvent[]; allDayIds: string[] } {
  const events: TimeEvent[] = [];
  const allDayIds: string[] = [];

  for (const r of reservations) {
    if (r.status === "cancelled") continue;
    const s = parseTimeToHours(r.startTime);
    const e = parseTimeToHours(r.endTime);
    if (s != null && e != null) {
      // 逆転時刻（end <= start）はデータ不備 — 終日扱いせず無視
      if (e <= s) continue;
      const cs = Math.max(shiftStart, s);
      const ce = Math.min(shiftEnd, e);
      if (ce > cs) {
        events.push({ time: cs, delta: 1, reservationId: r.id });
        events.push({ time: ce, delta: -1, reservationId: r.id });
      }
    } else if (s == null && e == null) {
      // 時間未設定 → 終日占有
      allDayIds.push(r.id);
    }
    // 片方だけ設定 → データ不備、無視
  }

  // 同時刻は終了(-1)を開始(+1)より先に処理 — 隣接予約を重複と見なさない
  events.sort((a, b) => (a.time === b.time ? a.delta - b.delta : a.time - b.time));
  return { events, allDayIds };
}

// ── 公開 API ──

/**
 * 同時占有のピーク数を返す。
 *
 * BoothsClient.tsx の maxConcurrent() と同じスイープラインアルゴリズムだが、
 * サーバー側で呼べる純関数として切り出したもの。
 *
 * 注意: 他の公開関数（computeBoothUtilization 等）と異なり booth 引数を取らない —
 * reservations は呼び出し側が単一ブース分に絞り込み済みであること。
 */
export function peakConcurrent(
  reservations: readonly BoothReservation[],
  shiftStart = SHIFT_START,
  shiftEnd = SHIFT_END,
): number {
  const { events, allDayIds } = toEvents(reservations, shiftStart, shiftEnd);
  let cur = 0;
  let peak = 0;
  for (const ev of events) {
    cur += ev.delta;
    if (cur > peak) peak = cur;
  }
  return allDayIds.length + peak;
}

/**
 * ブースの稼働率を計算。
 *
 * 営業時間（shiftStart〜shiftEnd）に対する予約占有時間の割合。
 * 同時に複数予約が入っている場合、占有時間は Union（重ならない部分の合計）。
 */
export function computeBoothUtilization(
  booth: BoothInfo,
  reservations: readonly BoothReservation[],
  shiftStart = SHIFT_START,
  shiftEnd = SHIFT_END,
): BoothUtilization {
  // no_show は実際にはブースを使っていないので稼働率から除外（completed は含める）
  const boothRes = reservations.filter((r) => r.boothId === booth.id && !NOT_ACTUAL_WORK.has(r.status));
  const { events, allDayIds } = toEvents(boothRes, shiftStart, shiftEnd);

  const totalMinutes = (shiftEnd - shiftStart) * 60;

  if (allDayIds.length > 0) {
    // 終日予約がある → 全営業時間が占有
    return {
      boothId: booth.id,
      occupiedMinutes: totalMinutes,
      totalMinutes,
      utilizationPct: 100,
      peakConcurrent: peakConcurrent(boothRes, shiftStart, shiftEnd),
    };
  }

  // スイープラインで占有区間の Union を計算
  let occupied = 0;
  let depth = 0;
  let unionStart = 0;
  for (const ev of events) {
    if (depth === 0 && ev.delta === 1) {
      unionStart = ev.time;
    }
    depth += ev.delta;
    if (depth === 0 && ev.delta === -1) {
      occupied += (ev.time - unionStart) * 60;
    }
  }

  return {
    boothId: booth.id,
    occupiedMinutes: Math.round(occupied),
    totalMinutes,
    utilizationPct: totalMinutes > 0 ? Math.min(100, Math.round((occupied * 100) / totalMinutes)) : 0,
    peakConcurrent: peakConcurrent(boothRes, shiftStart, shiftEnd),
  };
}

/**
 * 定員超過（同時予約数 > capacity）の時間帯を検出。
 *
 * スイープラインで同時予約数を追跡し、capacity を超える区間を返す。
 */
export function detectCapacityConflicts(
  booth: BoothInfo,
  reservations: readonly BoothReservation[],
  shiftStart = SHIFT_START,
  shiftEnd = SHIFT_END,
): CapacityConflict[] {
  // completed/no_show は占有していないので定員超過チェックから除外
  const boothRes = reservations.filter((r) => r.boothId === booth.id && !NON_OCCUPYING.has(r.status));
  const { events, allDayIds } = toEvents(boothRes, shiftStart, shiftEnd);

  // ponytail: early-return を削除 — 終日予約だけで超過していても、
  // timed 予約の ID も reservationIds に含めるためスイープラインを回す
  const conflicts: CapacityConflict[] = [];
  const active = new Set<string>(allDayIds);
  let windowStart: number | null = null;
  let windowPeak = 0;
  const windowIds = new Set<string>();

  // 終日予約だけで超過 → 営業開始からウィンドウを開く（timed 予約の ID も拾うためスイープ続行）
  if (active.size > booth.capacity) {
    windowStart = shiftStart;
    windowPeak = active.size;
    for (const id of active) windowIds.add(id);
  }

  for (const ev of events) {
    if (ev.delta === 1) active.add(ev.reservationId);
    else active.delete(ev.reservationId);

    const count = active.size;
    if (count > booth.capacity) {
      if (windowStart == null) {
        windowStart = ev.time;
        windowPeak = count;
        windowIds.clear();
        for (const id of active) windowIds.add(id);
      } else {
        if (count > windowPeak) windowPeak = count;
        for (const id of active) windowIds.add(id);
      }
    } else if (windowStart != null) {
      conflicts.push({
        boothId: booth.id,
        window: { start: windowStart, end: ev.time },
        peakConcurrent: windowPeak,
        capacity: booth.capacity,
        reservationIds: [...windowIds],
      });
      windowStart = null;
      windowPeak = 0;
      windowIds.clear();
    }
  }

  // 営業終了まで超過が続いた場合
  if (windowStart != null) {
    conflicts.push({
      boothId: booth.id,
      window: { start: windowStart, end: shiftEnd },
      peakConcurrent: windowPeak,
      capacity: booth.capacity,
      reservationIds: [...windowIds],
    });
  }

  return conflicts;
}

/**
 * ブースが空く推定時刻を返す（時単位）。
 *
 * nowHours 時点で進行中（in_progress）の予約の終了時刻を返す。
 * 終了時刻がない場合は estimatedMinutes から推定。
 * 空いていれば null。
 *
 * 注意: peakConcurrent 同様、reservations は呼び出し側が単一ブース分に
 * 絞り込み済みであること（booth 引数を取らない）。
 *
 * ponytail: in_progress だが endTime が既に過ぎており estimatedMinutes も
 * ない予約は、latestEnd に反映されない（結果 null → 呼び出し側が「空き」と
 * 誤読しうる）。実際は超過作業中で占有継続の可能性が高い。IMP-044 でこの
 * 関数を配線する際、正しいフォールバック（例: nowHours 自体を終了見込みとする）
 * を決めること。
 */
export function predictBoothFreeAt(reservations: readonly BoothReservation[], nowHours: number): number | null {
  let latestEnd: number | null = null;

  for (const r of reservations) {
    if (r.status !== "in_progress") continue;
    const s = parseTimeToHours(r.startTime);
    const e = parseTimeToHours(r.endTime);

    if (e != null && e > nowHours) {
      latestEnd = latestEnd != null ? Math.max(latestEnd, e) : e;
    } else if (s != null && r.estimatedMinutes != null && r.estimatedMinutes > 0) {
      const estimated = s + r.estimatedMinutes / 60;
      if (estimated > nowHours) {
        latestEnd = latestEnd != null ? Math.max(latestEnd, estimated) : estimated;
      }
    }
  }

  return latestEnd;
}

/**
 * 指定時刻に空いているブースを返す。
 *
 * 各ブースの空き時間帯リストと、指定時刻に空いているかどうかを計算。
 */
export function findAvailableBooths(
  booths: readonly BoothInfo[],
  allReservations: readonly BoothReservation[],
  atHours: number,
  shiftStart = SHIFT_START,
  shiftEnd = SHIFT_END,
): BoothAvailability[] {
  return booths
    .filter((b) => b.isActive)
    .map((booth) => {
      const boothRes = allReservations.filter((r) => r.boothId === booth.id && !NON_OCCUPYING.has(r.status));

      // 予約時間帯を収集してソート（toEvents と同じ判定: 逆転・片方欠損はデータ不備として無視）
      const occupied: Array<{ start: number; end: number }> = [];
      for (const r of boothRes) {
        const s = parseTimeToHours(r.startTime);
        const e = parseTimeToHours(r.endTime);
        if (s != null && e != null) {
          if (e > s) {
            occupied.push({
              start: Math.max(shiftStart, s),
              end: Math.min(shiftEnd, e),
            });
          }
          // e <= s は逆転データ不備 → 無視
        } else if (s == null && e == null) {
          // 時間未設定 → 終日
          occupied.push({ start: shiftStart, end: shiftEnd });
        }
        // 片方だけ設定 → データ不備、無視
      }
      occupied.sort((a, b) => a.start - b.start);

      // capacity=1 の場合のみ空き時間帯を計算（capacity>1 は同時利用可能なので単純な gap では不十分）
      // ponytail: capacity>1 の空き計算は IMP-046 で必要になったら拡張する
      const freeSlots: FreeSlot[] = [];
      if (booth.capacity <= 1) {
        // Union を取って gap を計算
        const merged = mergeIntervals(occupied);
        let cursor = shiftStart;
        for (const seg of merged) {
          if (seg.start > cursor) {
            freeSlots.push({ start: cursor, end: seg.start });
          }
          cursor = Math.max(cursor, seg.end);
        }
        if (cursor < shiftEnd) {
          freeSlots.push({ start: cursor, end: shiftEnd });
        }
      } else {
        // capacity>1: 空き = ピーク同時予約数 < capacity のとき「空きあり」
        // 詳細な時間帯分解は IMP-046 に委ねる
        const peak = peakConcurrent(boothRes, shiftStart, shiftEnd);
        if (peak < booth.capacity) {
          freeSlots.push({ start: shiftStart, end: shiftEnd });
        }
      }

      // 指定時刻に空いているか
      const atCount = countConcurrentAt(boothRes, atHours, shiftStart, shiftEnd);
      const currentlyFree = atCount < booth.capacity;

      return {
        boothId: booth.id,
        boothName: booth.name,
        boothType: booth.boothType,
        freeSlots,
        currentlyFree,
      };
    });
}

/** 区間リストの Union を返す（ソート済み前提）。 */
function mergeIntervals(intervals: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (intervals.length === 0) return [];
  const result: Array<{ start: number; end: number }> = [{ ...intervals[0] }];
  for (let i = 1; i < intervals.length; i++) {
    const last = result[result.length - 1];
    if (intervals[i].start <= last.end) {
      last.end = Math.max(last.end, intervals[i].end);
    } else {
      result.push({ ...intervals[i] });
    }
  }
  return result;
}

/** 指定時刻の同時予約数を返す（toEvents と同じ判定: 逆転・片方欠損は無視）。 */
function countConcurrentAt(
  reservations: readonly BoothReservation[],
  atHours: number,
  shiftStart: number,
  shiftEnd: number,
): number {
  let count = 0;
  for (const r of reservations) {
    if (NON_OCCUPYING.has(r.status)) continue;
    const s = parseTimeToHours(r.startTime);
    const e = parseTimeToHours(r.endTime);
    if (s != null && e != null) {
      if (e <= s) continue; // 逆転データ不備 → 無視
      const cs = Math.max(shiftStart, s);
      const ce = Math.min(shiftEnd, e);
      if (cs <= atHours && atHours < ce) count++;
    } else if (s == null && e == null) {
      // 時間未設定 → 終日
      count++;
    }
    // 片方だけ設定 → データ不備、無視
  }
  return count;
}
