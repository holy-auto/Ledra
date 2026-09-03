/**
 * SLA エスカレーション評価器（IMP-029）。
 *
 * v2.0 §13: 経過時間ベースの SLA エスカレーション判定。
 * insurer-sla-alerts cron の純粋関数部分を汎用化したもの。
 *
 * - cron 側の classifySlaStage / shouldNotify と同一ロジック。
 * - cron は insurer_cases 専用の DB 走査 + 通知挿入を行うが、
 *   この評価器はどのエンティティにも使える純粋関数。
 * - 将来 tenant 側の SLA（作業期限等）にも使える。
 *
 * ponytail: cron 側の関数は __testing export で残す。
 * この評価器はそのロジックの正規化版。cron を書き換える
 * 必要は無い（既に動いている）。
 */

// ── 型 ──

export type EscalationStage = "at_risk" | "overdue";

export type SlaThresholds = {
  urgent: number; // hours
  high: number;
  normal: number;
  low: number;
};

export type EscalationResult = {
  /** 現在のステージ。しきい値内なら null。 */
  stage: EscalationStage | null;
  /** 適用されたしきい値（時間）。 */
  thresholdHours: number;
  /** 残り時間（時間）。負値 = 超過。 */
  remainingHours: number;
  /** 経過時間（時間）。 */
  elapsedHours: number;
  /** 残り割合 (0–1)。0 以下 = 超過。 */
  remainingRatio: number;
};

// ── デフォルト SLA しきい値 ──

/** insurer-sla-alerts cron / GET /api/insurer/sla と同一のデフォルト値。 */
export const DEFAULT_SLA_THRESHOLDS: Readonly<SlaThresholds> = {
  urgent: 4,
  high: 24,
  normal: 72,
  low: 168, // 1 week
} as const;

/** at_risk 判定の残余割合。remaining <= threshold * AT_RISK_RATIO で at_risk。 */
export const AT_RISK_RATIO = 0.25;

// ── 評価関数 ──

/**
 * SLA エスカレーションステージを判定する。
 *
 * @param createdAtMs - 対象エンティティの作成日時 (Unix ms)
 * @param priority    - 優先度キー ("urgent" | "high" | "normal" | "low")
 * @param thresholds  - SLA しきい値マップ（時間単位）
 * @param nowMs       - 現在時刻 (Unix ms)
 * @returns           - ステージ・残り時間・経過時間
 */
export function evaluateEscalation(
  createdAtMs: number,
  priority: string,
  thresholds: SlaThresholds,
  nowMs: number,
): EscalationResult {
  const thresholdHours = Object.hasOwn(thresholds, priority)
    ? thresholds[priority as keyof SlaThresholds]
    : thresholds.normal;
  const elapsedHours = (nowMs - createdAtMs) / (1000 * 60 * 60);
  const remainingHours = thresholdHours - elapsedHours;
  const remainingRatio = thresholdHours > 0 ? remainingHours / thresholdHours : 0;

  let stage: EscalationStage | null = null;
  if (remainingHours <= 0) {
    stage = "overdue";
  } else if (remainingRatio <= AT_RISK_RATIO) {
    stage = "at_risk";
  }

  return { stage, thresholdHours, remainingHours, elapsedHours, remainingRatio };
}

// ── エスカレーション遷移 ──

/**
 * 前回の通知ステージを踏まえ、今回通知すべきか判定する。
 *
 * ルール（insurer-sla-alerts cron と同一）:
 * - null → at_risk: 通知する
 * - null → overdue: 通知する
 * - at_risk → overdue: 通知する（エスカレーション）
 * - at_risk → at_risk: 通知しない（重複抑止）
 * - overdue → overdue: 通知しない（重複抑止）
 * - overdue → at_risk: 通知しない（逆行しない）
 */
export function shouldEscalate(
  currentStage: EscalationStage,
  previousStage: EscalationStage | null | undefined,
): boolean {
  if (currentStage === "overdue") return previousStage !== "overdue";
  // currentStage === "at_risk"
  return previousStage !== "at_risk" && previousStage !== "overdue";
}
