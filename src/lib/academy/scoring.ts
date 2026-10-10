/**
 * Academy 学習進捗関連の共通ロジック (バッジ算出・スコア定義)
 */

export type LessonLevel = "intro" | "basic" | "standard" | "pro";

/** レッスン完了時に獲得できるスコア (level 別) */
export const LEVEL_SCORE: Record<LessonLevel, number> = {
  intro: 10,
  basic: 20,
  standard: 30,
  pro: 50,
};

export function scoreForLevel(level: string): number {
  if (level === "intro" || level === "basic" || level === "standard" || level === "pro") {
    return LEVEL_SCORE[level];
  }
  return 0;
}

/** 算出に使う進捗統計 */
export interface ProgressStats {
  lessons_completed: number;
  total_score: number;
  cases_submitted: number;
  certs_reviewed: number;
}

export interface Badge {
  id: string;
  label: string;
  description: string;
}

/**
 * 進捗統計から獲得済みバッジを計算する。
 * 後から追加しやすいようにテーブル駆動。
 */
export function computeBadges(stats: ProgressStats): Badge[] {
  const badges: Badge[] = [];

  if (stats.lessons_completed >= 1) {
    badges.push({ id: "first_lesson", label: "初学者", description: "初めてのレッスンを完了" });
  }
  if (stats.lessons_completed >= 10) {
    badges.push({ id: "lessons_10", label: "学習中", description: "10 レッスンを完了" });
  }
  if (stats.lessons_completed >= 30) {
    badges.push({ id: "lessons_30", label: "マスター", description: "30 レッスンを完了" });
  }
  if (stats.cases_submitted >= 1) {
    badges.push({ id: "first_case", label: "知識共有", description: "施工事例を1件公開" });
  }
  if (stats.cases_submitted >= 5) {
    badges.push({ id: "cases_5", label: "ナレッジ提供者", description: "施工事例を5件公開" });
  }
  if (stats.total_score >= 500) {
    badges.push({ id: "score_500", label: "高得点", description: "学習スコア 500 以上" });
  }

  return badges;
}

/**
 * 学習スコアからレベルを算出 (1-10)
 * 100スコアで1レベル上がる。レベル10で打ち止め。
 */
export function levelFromScore(totalScore: number): number {
  return Math.min(10, Math.max(1, Math.floor(totalScore / 100) + 1));
}
