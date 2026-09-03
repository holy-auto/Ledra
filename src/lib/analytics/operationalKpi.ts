/**
 * IMP-046: v2.0 §21 運用 KPI 計算器。
 *
 * 既存の ManagementClient は財務 KPI（CF・粗利・回収率・LTV 等）を表示するが、
 * v2.0 §21 が要求する運用指標（VERIFIED 率・証跡充足率・レビュー待ち時間・
 * ジョブスループット・SLA 遵守率）が欠落していた。
 *
 * 本モジュールはこれらを算出する純関数群を提供する。
 * 呼び出し側（API ルート）が DB から集計済みデータを渡し、
 * 本モジュールが KPI 値を返す。IO なし。
 *
 * 依存:
 * - IMP-001 states.ts の CertificateState/JobState（型参照のみ）
 * - IMP-029 escalation.ts の EscalationStage（型参照のみ）
 * - IMP-023 evidenceProgress.ts のパターン（集計済みデータから率を算出）
 */

import type { CertificateState, JobState } from "@/lib/domain/states";
import type { EscalationStage } from "@/lib/notifications/escalation";

// ── 入力型 ──

/** 証明書の状態別カウント。呼び出し側が GROUP BY certificate_state で集計。 */
export type CertificateStateCounts = Partial<Record<CertificateState, number>>;

/** 証跡充足の集計結果。呼び出し側が evidenceProgress を各ジョブに適用して集計。 */
export interface EvidenceSufficiencyInput {
  /** 証跡評価対象のジョブ/証明書総数 */
  total: number;
  /** 必須ショットがすべて充足しているジョブ/証明書数 */
  complete: number;
}

/**
 * ジョブのタイムライン。サイクルタイム・レビュー待ち時間の算出に使う。
 * 呼び出し側が reservations + certificate timestamps から組み立て。
 */
export interface JobTimeline {
  /** ジョブの状態（現在）。 */
  currentState: JobState;
  /** 予約確定日時 (ISO) */
  scheduledAt: string;
  /** 作業開始日時 (ISO)。未着手なら null。 */
  startedAt: string | null;
  /** 作業完了日時 (ISO)。未完了なら null。 */
  completedAt: string | null;
  /** 証明書 VERIFIED 到達日時 (ISO)。未検証なら null。 */
  verifiedAt: string | null;
}

/** SLA 評価済みレコード。IMP-029 evaluateEscalation の結果。 */
export interface SlaEvaluatedRecord {
  stage: EscalationStage | null;
}

/** スループット算出用の完了ジョブカウント。 */
export interface ThroughputInput {
  /** 期間内の完了ジョブ数 */
  completedCount: number;
  /** 期間の日数 */
  periodDays: number;
}

// ── 出力型 ──

export interface OperationalKPIs {
  /** VERIFIED 到達率 (0–100)。発行対象の証明書のうち VERIFIED に達した割合。 */
  verifiedRate: number | null;
  /** 証跡充足率 (0–100)。必須ショットが揃っているジョブの割合。 */
  evidenceSufficiencyRate: number | null;
  /** 平均レビュー待ち時間（時間）。作業完了→VERIFIED の平均。 */
  avgReviewWaitHours: number | null;
  /** 平均ジョブサイクルタイム（時間）。SCHEDULED→VERIFIED の平均。 */
  avgCycleTimeHours: number | null;
  /** SLA 遵守率 (0–100)。at_risk/overdue でないレコードの割合。 */
  slaComplianceRate: number | null;
  /** 日次スループット。完了ジョブ数 / 日。 */
  dailyThroughput: number | null;
}

// ── 計算 ──

/**
 * VERIFIED 到達率を算出。
 *
 * 分母 = 発行プロセスに入った証明書のうち現行版のみ（NOT_READY と SUPERSEDED を除く。
 *         REVOKED は含む — 発行後に無効化された事実も分母に残す）
 * 分子 = VERIFIED に到達した証明書
 *
 * ponytail: NOT_READY は「まだ発行条件が揃っていない下書き」なので分母から除外。
 * SUPERSEDED は版遷移で旧版（既に VERIFIED 通過済み）なので分母・分子ともに除外
 * — 現行版のみで率を測る。
 */
export function computeVerifiedRate(counts: CertificateStateCounts): number | null {
  const notReady = counts.NOT_READY ?? 0;
  const superseded = counts.SUPERSEDED ?? 0;
  const total = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
  const denominator = total - notReady - superseded;
  if (denominator <= 0) return null;
  const verified = counts.VERIFIED ?? 0;
  return Math.round((verified / denominator) * 10000) / 100;
}

/** 証跡充足率を算出。 */
export function computeEvidenceSufficiencyRate(input: EvidenceSufficiencyInput): number | null {
  if (input.total <= 0) return null;
  return Math.round((input.complete / input.total) * 10000) / 100;
}

/**
 * レビュー待ち時間（作業完了→VERIFIED）の平均を算出。
 *
 * completedAt と verifiedAt の両方が存在するジョブのみ対象。
 * 負値（verifiedAt < completedAt）は不正データとしてスキップ。
 */
export function computeAvgReviewWaitHours(timelines: readonly JobTimeline[]): number | null {
  let sum = 0;
  let count = 0;
  for (const t of timelines) {
    if (t.completedAt == null || t.verifiedAt == null) continue;
    const hours = (new Date(t.verifiedAt).getTime() - new Date(t.completedAt).getTime()) / (1000 * 60 * 60);
    // 不正なタイムスタンプは Date.getTime() が NaN を返す。NaN < 0 は false なので
    // hours < 0 だけでは弾けず、sum が NaN に汚染されて平均全体が壊れる。
    if (!Number.isFinite(hours) || hours < 0) continue; // データ不備
    sum += hours;
    count++;
  }
  return count > 0 ? Math.round((sum / count) * 10) / 10 : null;
}

/**
 * ジョブサイクルタイム（SCHEDULED→VERIFIED）の平均を算出。
 *
 * scheduledAt と verifiedAt の両方が存在するジョブのみ対象。
 */
export function computeAvgCycleTimeHours(timelines: readonly JobTimeline[]): number | null {
  let sum = 0;
  let count = 0;
  for (const t of timelines) {
    if (t.verifiedAt == null) continue;
    const hours = (new Date(t.verifiedAt).getTime() - new Date(t.scheduledAt).getTime()) / (1000 * 60 * 60);
    if (!Number.isFinite(hours) || hours < 0) continue; // データ不備（NaN 汚染防止、上記と同じ理由）
    sum += hours;
    count++;
  }
  return count > 0 ? Math.round((sum / count) * 10) / 10 : null;
}

/**
 * SLA 遵守率を算出。
 *
 * null stage = SLA 内（at_risk でも overdue でもない）。
 */
export function computeSlaComplianceRate(records: readonly SlaEvaluatedRecord[]): number | null {
  if (records.length === 0) return null;
  const compliant = records.filter((r) => r.stage === null).length;
  return Math.round((compliant / records.length) * 10000) / 100;
}

/**
 * 日次スループットを算出。
 *
 * 小数第2位まで保持する（第1位までだと、期間が長く件数が少ない場合
 * 例: 30日で1件≈0.03/日 のような非ゼロの実績が 0 に潰れてしまう）。
 */
export function computeDailyThroughput(input: ThroughputInput): number | null {
  if (input.periodDays <= 0) return null;
  return Math.round((input.completedCount / input.periodDays) * 100) / 100;
}

/**
 * 全運用 KPI を一括算出。
 *
 * 各入力は省略可（undefined → 該当 KPI は null）。
 * API ルートが DB から取得できるデータのみ渡せばよい。
 */
export function computeOperationalKPIs(input: {
  certificateCounts?: CertificateStateCounts;
  evidenceSufficiency?: EvidenceSufficiencyInput;
  timelines?: readonly JobTimeline[];
  slaRecords?: readonly SlaEvaluatedRecord[];
  throughput?: ThroughputInput;
}): OperationalKPIs {
  return {
    verifiedRate: input.certificateCounts ? computeVerifiedRate(input.certificateCounts) : null,
    evidenceSufficiencyRate: input.evidenceSufficiency
      ? computeEvidenceSufficiencyRate(input.evidenceSufficiency)
      : null,
    avgReviewWaitHours: input.timelines ? computeAvgReviewWaitHours(input.timelines) : null,
    avgCycleTimeHours: input.timelines ? computeAvgCycleTimeHours(input.timelines) : null,
    slaComplianceRate: input.slaRecords ? computeSlaComplianceRate(input.slaRecords) : null,
    dailyThroughput: input.throughput ? computeDailyThroughput(input.throughput) : null,
  };
}
