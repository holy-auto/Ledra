/**
 * IMP-046: 設備キャパシティ分析（v2.0 §21 capacity visibility）。
 *
 * IMP-041 occupancy.ts が単一ブースの稼働率・空き検索を提供するが、
 * v2.0 §21 が要求する「店舗全体のキャパシティ可視化」が欠落していた。
 * また、capacity > 1 のブースの時間帯別占有分解は IMP-041 で IMP-046 に
 * 明示的に委ねられていた（occupancy.ts L330, L347）。
 *
 * 本モジュールは:
 * 1. 全ブースのフリート稼働率サマリー
 * 2. capacity > 1 ブースの時間帯別占有分解（time-band decomposition）
 * 3. スタッフ負荷分析（担当ジョブ数ベース）
 *
 * を純関数で提供する。IO なし。
 *
 * 依存:
 * - IMP-041 occupancy.ts（BoothInfo, BoothReservation, BoothUtilization,
 *   computeBoothUtilization, detectCapacityConflicts を再利用）
 */

import type { BoothInfo, BoothReservation, BoothUtilization } from "@/lib/booths/occupancy";
import {
  computeBoothUtilization,
  detectCapacityConflicts,
  NON_OCCUPYING,
  UTILIZATION_EXCLUDED,
} from "@/lib/booths/occupancy";
import { parseTimeToHours, SHIFT_START, SHIFT_END } from "@/lib/gantt/board";

// ── 時間帯別占有分解（capacity > 1 対応） ──

export interface CapacityTimeBand {
  /** 時間帯の開始（時単位、例: 9.0） */
  start: number;
  /** 時間帯の終了 */
  end: number;
  /** この時間帯の同時占有数 */
  concurrent: number;
  /** ブースの定員 */
  capacity: number;
  /** 空き = capacity - concurrent（0 以上） */
  available: number;
}

/**
 * ブースの1日をイベント駆動で時間帯分解し、各帯の占有レベルを返す。
 *
 * capacity > 1 のブースでは、同時予約数が時間帯ごとに変化するため
 * 単純な gap 計算では空きを正確に表現できない。
 * スイープラインで同時数が変化する境界ごとに帯を切り出す。
 *
 * IMP-041 occupancy.ts L330/L347 から委ねられた実装。
 *
 * @param excludeStatuses 占有とみなさないステータス集合。デフォルトは NON_OCCUPYING
 *   （completed も除外＝空き検索など「今後の可用性」向けの判定）。稼働率計算
 *   （completed は稼働実績に含める）に使う場合は UTILIZATION_EXCLUDED を渡す。
 */
export function decomposeTimeBands(
  booth: BoothInfo,
  reservations: readonly BoothReservation[],
  shiftStart = SHIFT_START,
  shiftEnd = SHIFT_END,
  excludeStatuses: ReadonlySet<string> = NON_OCCUPYING,
): CapacityTimeBand[] {
  // occupancy.ts の除外ステータス定数を再利用（終端ステータスの定義を重複させない）
  const boothRes = reservations.filter((r) => r.boothId === booth.id && !excludeStatuses.has(r.status));

  // イベント生成
  const events: Array<{ time: number; delta: 1 | -1 }> = [];
  let allDayCount = 0;

  for (const r of boothRes) {
    const s = parseTimeToHours(r.startTime);
    const e = parseTimeToHours(r.endTime);
    if (s != null && e != null && e > s) {
      const cs = Math.max(shiftStart, s);
      const ce = Math.min(shiftEnd, e);
      if (ce > cs) {
        events.push({ time: cs, delta: 1 });
        events.push({ time: ce, delta: -1 });
      }
    } else if (s == null && e == null) {
      allDayCount++;
    }
  }

  // 同時刻は終了を先に
  events.sort((a, b) => (a.time === b.time ? a.delta - b.delta : a.time - b.time));

  // 帯を切り出す
  const bands: CapacityTimeBand[] = [];
  let cursor = shiftStart;
  let depth = allDayCount;

  for (const ev of events) {
    if (ev.time > cursor) {
      bands.push({
        start: cursor,
        end: ev.time,
        concurrent: depth,
        capacity: booth.capacity,
        available: Math.max(0, booth.capacity - depth),
      });
    }
    depth += ev.delta;
    cursor = ev.time;
  }

  // 最後の帯（最終イベント→営業終了）
  if (cursor < shiftEnd) {
    bands.push({
      start: cursor,
      end: shiftEnd,
      concurrent: depth,
      capacity: booth.capacity,
      available: Math.max(0, booth.capacity - depth),
    });
  }

  return bands;
}

// ── フリート稼働率サマリー ──

export interface FleetUtilizationSummary {
  /** 全ブース数（非アクティブ含む） */
  totalBooths: number;
  /** アクティブなブース数 */
  activeBooths: number;
  /** アクティブブースの平均稼働率 (0–100) */
  avgUtilizationPct: number;
  /** アクティブブースの最大稼働率 (0–100) */
  peakUtilizationPct: number;
  /** 全ブースのキャパシティ超過時間帯の数 */
  totalConflicts: number;
  /** 各ブースの稼働詳細 */
  boothDetails: BoothUtilization[];
}

/**
 * 全ブースの稼働率を集計してサマリーを返す。
 *
 * ManagementClient の KPI セクションに設備稼働の概況を追加するための
 * データソース。
 */
export function computeFleetUtilization(
  booths: readonly BoothInfo[],
  reservations: readonly BoothReservation[],
  shiftStart = SHIFT_START,
  shiftEnd = SHIFT_END,
): FleetUtilizationSummary {
  const activeBooths = booths.filter((b) => b.isActive);
  const rawDetails = activeBooths.map((b) => computeBoothUtilization(b, reservations, shiftStart, shiftEnd));

  let totalConflicts = 0;
  for (const b of activeBooths) {
    totalConflicts += detectCapacityConflicts(b, reservations, shiftStart, shiftEnd).length;
  }

  // computeBoothUtilization() は「区間の union」で稼働率を出すため、capacity > 1 の
  // ブースでは定員の一部しか埋まっていなくても 100% と過大評価してしまう
  // （例: capacity=3 で1件だけ終日予約 → union稼働率100%だが実際は1/3枠のみ使用）。
  // decomposeTimeBands() の時間帯別 concurrent/capacity で正規化した値に置き換える。
  // boothDetails を computeBoothUtilization() の union ベース値のままにすると、
  // capacity>1 のブースで avg/peak（下記）と矛盾する値になる（Codex #1009 指摘）ため、
  // occupiedMinutes/utilizationPct を capacity 正規化した値へ上書きし、avg/peak も
  // この boothDetails から導出することで矛盾しようがない構造にする。
  // peakConcurrent はそのまま computeBoothUtilization() の値を使う（capacity に対する
  // 同時数という別の情報であり、正規化の対象ではない）。
  // UTILIZATION_EXCLUDED を渡し、computeBoothUtilization() と同じ「completed は
  // 稼働実績に含める」判定に揃える（decomposeTimeBands のデフォルトの NON_OCCUPYING
  // だと completed も除外され、矛盾が再発する）。
  const boothDetails: BoothUtilization[] = activeBooths.map((b, i) => {
    const bands = decomposeTimeBands(b, reservations, shiftStart, shiftEnd, UTILIZATION_EXCLUDED);
    const totalCapacityMinutes = b.capacity * (shiftEnd - shiftStart) * 60;
    let weightedOccupiedMinutes = 0;
    for (const band of bands) {
      const durationMinutes = (band.end - band.start) * 60;
      weightedOccupiedMinutes += Math.min(band.concurrent, band.capacity) * durationMinutes;
    }
    const utilizationPct =
      totalCapacityMinutes > 0 ? Math.round((weightedOccupiedMinutes / totalCapacityMinutes) * 100) : 0;
    // 定員1枠換算の実効占有分。occupiedMinutes/totalMinutes の比率が utilizationPct と
    // 一致するようにする（capacity>1 のブースで「合計は480分なのに稼働率33%」という
    // 一見矛盾した表示にならないようにするため）。
    const occupiedMinutes = b.capacity > 0 ? Math.round(weightedOccupiedMinutes / b.capacity) : 0;
    return { ...rawDetails[i], occupiedMinutes, utilizationPct };
  });

  const avgPct =
    boothDetails.length > 0
      ? Math.round(boothDetails.reduce((s, d) => s + d.utilizationPct, 0) / boothDetails.length)
      : 0;
  const peakPct = boothDetails.length > 0 ? Math.max(...boothDetails.map((d) => d.utilizationPct)) : 0;

  return {
    totalBooths: booths.length,
    activeBooths: activeBooths.length,
    avgUtilizationPct: avgPct,
    peakUtilizationPct: peakPct,
    totalConflicts,
    boothDetails,
  };
}

// ── スタッフ負荷分析 ──

/** スタッフの担当ジョブ。呼び出し側が reservations から組み立て。 */
export interface StaffJob {
  staffId: string;
  /** 見積作業時間（分） */
  estimatedMinutes: number | null;
  /** 実績作業時間（分）。完了済みなら actual、進行中なら経過時間。 */
  actualMinutes: number | null;
}

export interface StaffLoadSummary {
  staffId: string;
  /** 担当ジョブ数 */
  jobCount: number;
  /** 見積合計（分） */
  totalEstimatedMinutes: number;
  /** 実績合計（分） */
  totalActualMinutes: number;
  /**
   * 負荷率 (0–100)。実効時間合計 / 営業時間。
   * 実効時間 = actualMinutes（実績があれば）、なければ estimatedMinutes（未着手の代理値）。
   * totalActualMinutes（実績のみの合計）とは一致しない場合がある点に注意。
   * ponytail: 営業時間は shiftEnd - shiftStart から算出。
   * 100% 超えは残業を意味する。
   */
  loadPct: number;
  /** 見積 vs 実績の効率（見積 / 実績）。1.0 = 予定通り、> 1.0 = 速い。 */
  efficiencyRatio: number | null;
}

export interface StaffCapacitySummary {
  /** 分析対象のスタッフ数 */
  totalStaff: number;
  /** 平均負荷率 (0–100) */
  avgLoadPct: number;
  /** 最大負荷率 */
  peakLoadPct: number;
  /** 負荷率 80% 超のスタッフ数 */
  overloadedCount: number;
  /** 負荷率 30% 未満のスタッフ数 */
  underutilizedCount: number;
  /** 各スタッフの詳細 */
  staffDetails: StaffLoadSummary[];
}

/**
 * スタッフの負荷分析を算出。
 *
 * ジョブの見積・実績時間からスタッフごとの負荷率を計算し、
 * 過負荷/遊休のスタッフを識別する。
 *
 * @param allStaffIds ジョブ0件のスタッフも集計に含めたい場合に渡す全スタッフID。
 *   省略時は jobs に出現したスタッフのみが対象になる（ジョブ0件＝遊休の実態が
 *   totalStaff/avgLoadPct/underutilizedCount から漏れる点に注意）。
 */
export function computeStaffCapacity(
  jobs: readonly StaffJob[],
  shiftStart = SHIFT_START,
  shiftEnd = SHIFT_END,
  allStaffIds?: readonly string[],
): StaffCapacitySummary {
  const shiftMinutes = (shiftEnd - shiftStart) * 60;
  const byStaff = new Map<
    string,
    { jobCount: number; totalEstimated: number; totalActual: number; totalEffective: number }
  >();

  const emptyEntry = () => ({ jobCount: 0, totalEstimated: 0, totalActual: 0, totalEffective: 0 });

  for (const j of jobs) {
    const entry = byStaff.get(j.staffId) ?? emptyEntry();
    entry.jobCount++;
    entry.totalEstimated += j.estimatedMinutes ?? 0;
    entry.totalActual += j.actualMinutes ?? 0;
    // actualMinutes が null（未着手・予定のみ）の場合は見積時間を負荷の代理値に使う。
    // これがないと、見積のみで埋まった予定のスタッフが 0% 負荷と誤って報告される。
    // actualMinutes: 0（実際に0分だった、と判明済み）はそのまま 0 として扱う。
    entry.totalEffective += j.actualMinutes ?? j.estimatedMinutes ?? 0;
    byStaff.set(j.staffId, entry);
  }

  for (const staffId of allStaffIds ?? []) {
    if (!byStaff.has(staffId)) byStaff.set(staffId, emptyEntry());
  }

  let overloadedCount = 0;
  let underutilizedCount = 0;
  let peakLoadPct = 0;
  let sumLoadPct = 0;

  const details: StaffLoadSummary[] = [...byStaff.entries()].map(([staffId, entry]) => {
    // 過負荷/遊休の判定は丸め前の比率で行う（丸め後の loadPct で判定すると
    // 例: 80.3% が 80 に丸まって「過負荷」から漏れる境界値バグになる）。
    const loadRatioPct = shiftMinutes > 0 ? (entry.totalEffective / shiftMinutes) * 100 : 0;
    const loadPct = Math.round(loadRatioPct);
    if (loadRatioPct > 80) overloadedCount++;
    if (loadRatioPct < 30) underutilizedCount++;
    sumLoadPct += loadPct;
    peakLoadPct = Math.max(peakLoadPct, loadPct);

    const efficiencyRatio =
      entry.totalActual > 0 ? Math.round((entry.totalEstimated / entry.totalActual) * 100) / 100 : null;

    return {
      staffId,
      jobCount: entry.jobCount,
      totalEstimatedMinutes: entry.totalEstimated,
      totalActualMinutes: entry.totalActual,
      loadPct,
      efficiencyRatio,
    };
  });

  const avgLoadPct = details.length > 0 ? Math.round(sumLoadPct / details.length) : 0;

  return {
    totalStaff: details.length,
    avgLoadPct,
    peakLoadPct,
    overloadedCount,
    underutilizedCount,
    staffDetails: details,
  };
}
