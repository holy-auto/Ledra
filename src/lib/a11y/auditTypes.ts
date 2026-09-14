/**
 * IMP-051: WCAG AA 監査フレームワーク型定義（v2.0 §3.5）。
 *
 * アクセシビリティ監査の結果を構造化するための型。
 * Lighthouse CI のスコアと合わせて、コンポーネント単位の
 * WCAG AA 準拠状態をトラッキングする。
 *
 * 純型定義。IO なし。
 */

// ── WCAG レベル ──

export type WcagLevel = "A" | "AA" | "AAA";

export type WcagCategory = "perceivable" | "operable" | "understandable" | "robust";

// ── WCAG 基準 ──

export interface WcagCriterion {
  /** 例: "1.4.3" */
  id: string;
  level: WcagLevel;
  category: WcagCategory;
  /** 英語名 */
  title: string;
  /** Ledra での該当性メモ */
  relevance?: string;
}

/**
 * Ledra に関連する WCAG 2.1 Level AA 基準の抜粋。
 *
 * ponytail: 全 50 基準を網羅するのは過剰。
 * Web アプリとして特に違反しやすい基準のみ列挙。
 */
export const WCAG_AA_KEY_CRITERIA: readonly WcagCriterion[] = [
  // ── Perceivable ──
  {
    id: "1.1.1",
    level: "A",
    category: "perceivable",
    title: "Non-text Content",
    relevance: "画像/アイコンの alt テキスト",
  },
  {
    id: "1.3.1",
    level: "A",
    category: "perceivable",
    title: "Info and Relationships",
    relevance: "フォームラベル、テーブル構造",
  },
  {
    id: "1.3.2",
    level: "A",
    category: "perceivable",
    title: "Meaningful Sequence",
    relevance: "DOM 順序と視覚順序の一致",
  },
  {
    id: "1.4.1",
    level: "A",
    category: "perceivable",
    title: "Use of Color",
    relevance: "ステータスバッジの色のみ依存",
  },
  {
    id: "1.4.3",
    level: "AA",
    category: "perceivable",
    title: "Contrast (Minimum)",
    relevance: "テキスト/背景のコントラスト比 ≥4.5:1",
  },
  {
    id: "1.4.4",
    level: "AA",
    category: "perceivable",
    title: "Resize Text",
    relevance: "200% ズームでコンテンツ欠落なし",
  },
  {
    id: "1.4.11",
    level: "AA",
    category: "perceivable",
    title: "Non-text Contrast",
    relevance: "UIコンポーネント境界線 ≥3:1",
  },

  // ── Operable ──
  { id: "2.1.1", level: "A", category: "operable", title: "Keyboard", relevance: "全操作がキーボードで可能" },
  {
    id: "2.1.2",
    level: "A",
    category: "operable",
    title: "No Keyboard Trap",
    relevance: "モーダル/ドロワーのフォーカストラップ",
  },
  { id: "2.4.3", level: "A", category: "operable", title: "Focus Order", relevance: "タブ順序が論理的" },
  { id: "2.4.6", level: "AA", category: "operable", title: "Headings and Labels", relevance: "見出し階層の正しさ" },
  {
    id: "2.4.7",
    level: "AA",
    category: "operable",
    title: "Focus Visible",
    relevance: "フォーカスインジケーターの視認性",
  },

  // ── Understandable ──
  { id: "3.1.1", level: "A", category: "understandable", title: "Language of Page", relevance: "html lang 属性" },
  {
    id: "3.1.2",
    level: "AA",
    category: "understandable",
    title: "Language of Parts",
    relevance: "多言語コンテンツの lang 指定",
  },
  {
    id: "3.2.1",
    level: "A",
    category: "understandable",
    title: "On Focus",
    relevance: "フォーカス時の予期しない変更なし",
  },
  {
    id: "3.3.1",
    level: "A",
    category: "understandable",
    title: "Error Identification",
    relevance: "バリデーションエラーの明示",
  },
  {
    id: "3.3.2",
    level: "A",
    category: "understandable",
    title: "Labels or Instructions",
    relevance: "入力フィールドのラベル",
  },

  // ── Robust ──
  { id: "4.1.2", level: "A", category: "robust", title: "Name, Role, Value", relevance: "カスタム UI の aria 属性" },
  { id: "4.1.3", level: "AA", category: "robust", title: "Status Messages", relevance: "非同期更新の aria-live" },
] as const;

// ── 監査結果 ──

export type A11ySeverity = "critical" | "serious" | "moderate" | "minor";

export interface A11yFinding {
  /** WCAG 基準 ID (例: "1.4.3") */
  criterionId: string;
  severity: A11ySeverity;
  /** 対象コンポーネント/ページ */
  target: string;
  /** 問題の説明 */
  description: string;
  /** 修正提案 */
  suggestion?: string;
}

export interface A11yAuditResult {
  /** 監査日（ISO 8601） */
  auditedAt: string;
  /** 対象（ページ/コンポーネント名） */
  scope: string;
  /** 検出された問題 */
  findings: A11yFinding[];
  /** Lighthouse a11y スコア（あれば） */
  lighthouseScore?: number;
}

// ── コンポーネント ARIA 要件 ──

export interface ComponentAriaRequirement {
  /** コンポーネント名 */
  component: string;
  /** 必須の ARIA 属性 */
  required: string[];
  /** 推奨の ARIA 属性 */
  recommended: string[];
}

/**
 * Ledra の共有コンポーネントに対する ARIA 要件マップ。
 *
 * ponytail: IMP-010 で追加されたコンポーネント + 既存の主要 UI を対象。
 * 将来の自動検証（eslint-plugin-jsx-a11y 拡張等）の基礎データ。
 */
export const COMPONENT_ARIA_MAP: readonly ComponentAriaRequirement[] = [
  { component: "Modal", required: ["aria-modal", "role=dialog", "aria-labelledby"], recommended: ["aria-describedby"] },
  { component: "Drawer", required: ["aria-modal", "role=dialog", "aria-labelledby"], recommended: [] },
  { component: "BottomSheet", required: ["aria-modal", "role=dialog", "aria-labelledby"], recommended: [] },
  { component: "Alert", required: ["role=alert"], recommended: ["aria-live=assertive"] },
  { component: "StatusBadge", required: [], recommended: ["aria-label"] },
  { component: "IconButton", required: ["aria-label"], recommended: [] },
  { component: "SegmentedControl", required: ["role=radiogroup"], recommended: ["aria-label"] },
  { component: "Tabs", required: ["role=tablist"], recommended: ["aria-orientation"] },
  {
    component: "ProgressCard",
    required: ["role=progressbar", "aria-valuenow", "aria-valuemin", "aria-valuemax"],
    recommended: ["aria-label"],
  },
  { component: "Toast", required: ["role=status", "aria-live=polite"], recommended: [] },
] as const;
