import type { FeatureId } from "@/lib/billing/featureKeys";
export type { PlanTier } from "@/types/billing";
import type { PlanTier } from "@/types/billing";

export type FeatureKey = FeatureId;

/**
 * - 不明な plan_tier は "pro" 扱い（UIは緩く→実際の制限はAPI/402で止める）
 * - ここは「見た目の制限」(ボタン無効/画面無効) 用のマトリクス
 */
const MATRIX: Record<PlanTier, Record<FeatureKey, boolean>> = {
  free: {
    issue_certificate: true,
    export_one_csv: false,
    export_search_csv: false,
    export_selected_csv: false,
    pdf_one: true,
    pdf_zip: false,
    manage_templates: false,
    upload_logo: false,
    manage_stores: false,
    // AI機能
    ai_draft: false,
    ai_explain: false,
    ai_quality: true, // 基本チェックは全プラン
    ai_quality_vision: false,
    ai_follow_up: false,
    ai_academy_feedback: false,
    ai_academy_qa: false,
    ai_proposal: false,
    ai_follow_up_email: false,
  },
  starter: {
    issue_certificate: true,
    export_one_csv: true,
    export_search_csv: false,
    export_selected_csv: false,
    pdf_one: true,
    pdf_zip: false,
    manage_templates: false,
    upload_logo: true,
    manage_stores: false,
    // AI機能
    ai_draft: false,
    ai_explain: false,
    ai_quality: true,
    ai_quality_vision: false,
    ai_follow_up: false,
    ai_academy_feedback: false,
    ai_academy_qa: false,
    ai_proposal: false,
    ai_follow_up_email: false,
  },
  standard: {
    issue_certificate: true,
    export_one_csv: true,
    export_search_csv: true,
    export_selected_csv: false,
    pdf_one: true,
    pdf_zip: true,
    manage_templates: true,
    upload_logo: true,
    manage_stores: true,
    // AI機能（Standard以上で全解除）
    ai_draft: true,
    ai_explain: true,
    ai_quality: true,
    ai_quality_vision: true,
    ai_follow_up: true,
    ai_academy_feedback: true,
    ai_academy_qa: true,
    ai_proposal: true,
    ai_follow_up_email: true,
  },
  pro: {
    issue_certificate: true,
    export_one_csv: true,
    export_search_csv: true,
    export_selected_csv: true,
    pdf_one: true,
    pdf_zip: true,
    manage_templates: true,
    upload_logo: true,
    manage_stores: true,
    // AI機能
    ai_draft: true,
    ai_explain: true,
    ai_quality: true,
    ai_quality_vision: true,
    ai_follow_up: true,
    ai_academy_feedback: true,
    ai_academy_qa: true,
    ai_proposal: true,
    ai_follow_up_email: true,
  },
};

export function normalizePlanTier(v: any): PlanTier {
  const s = String(v ?? "").toLowerCase();
  if (s === "free") return "free";
  if (s === "starter" || s === "mini") return "starter";
  if (s === "standard") return "standard";
  if (s === "pro") return "pro";
  return "free";
}

export function canUseFeature(planTier: any, feature: FeatureKey): boolean {
  const tier = normalizePlanTier(planTier);
  return !!MATRIX[tier]?.[feature];
}

export function featureLabel(feature: FeatureKey): string {
  switch (feature) {
    case "issue_certificate":
      return "証明書の新規作成";
    case "export_one_csv":
      return "CSV出力（単体）";
    case "export_search_csv":
      return "CSV出力（検索結果）";
    case "export_selected_csv":
      return "CSV出力（選択分）";
    case "pdf_one":
      return "PDF出力（単体）";
    case "pdf_zip":
      return "PDF ZIP出力（選択分）";
    case "manage_templates":
      return "テンプレート管理";
    case "upload_logo":
      return "ロゴアップロード";
    case "manage_stores":
      return "店舗管理";
    case "ai_draft":
      return "AI証明書下書き";
    case "ai_explain":
      return "AI説明変換";
    case "ai_quality":
      return "AI品質チェック";
    case "ai_quality_vision":
      return "AI写真Vision検証";
    case "ai_follow_up":
      return "AIフォローアップ";
    case "ai_academy_feedback":
      return "Academy AIフィードバック";
    case "ai_academy_qa":
      return "Academy QAアシスタント";
    case "ai_proposal":
      return "AIヒアリング提案";
    case "ai_follow_up_email":
      return "AIフォローメール";
    default:
      return feature;
  }
}

/** 写真添付枚数上限（プランごと） */
export const PHOTO_LIMITS: Record<PlanTier, number> = {
  free: 3,
  starter: 5,
  standard: 10,
  pro: 20,
};

/** 店舗数上限（プランごと） */
export const STORE_LIMITS: Record<PlanTier, number> = {
  free: 1,
  starter: 1,
  standard: 2,
  pro: 5,
};

/** 月間証明発行上限（プランごと、null = 無制限） */
export const CERT_LIMITS: Record<PlanTier, number | null> = {
  free: 10,
  starter: 80,
  standard: 300,
  pro: null,
};

/** compile-time exhaustiveness check (auto) */
type __NoExtraKeys<T> = Exclude<keyof T, FeatureKey> extends never ? T : never;
const __assertExactFeatureKeys = <T extends Record<FeatureKey, unknown>>(t: __NoExtraKeys<T>) => t;

// MATRIX must include ALL FeatureId keys (no missing / no extra)
// MATRIX rows must include ALL FeatureId keys (no missing / no extra)
__assertExactFeatureKeys(MATRIX.free);
__assertExactFeatureKeys(MATRIX.starter);
__assertExactFeatureKeys(MATRIX.standard);
__assertExactFeatureKeys(MATRIX.pro);
/** compile-time diff (auto): show missing/extra keys as readable TS errors */
type __MissingFeatureKeys = Exclude<FeatureId, keyof typeof MATRIX>;
type __ExtraFeatureKeys = Exclude<keyof typeof MATRIX, FeatureId>;

// If missing/extra exists, the error type will include the key union.
type __CheckMissingFeatureKeys = __MissingFeatureKeys extends never
  ? true
  : ["Missing FeatureId keys in MATRIX", __MissingFeatureKeys];
type __CheckExtraFeatureKeys = __ExtraFeatureKeys extends never
  ? true
  : ["Extra keys in MATRIX (not in FeatureId)", __ExtraFeatureKeys];

const __checkMissingFeatureKeys: __CheckMissingFeatureKeys = true as unknown as __CheckMissingFeatureKeys;
const __checkExtraFeatureKeys: __CheckExtraFeatureKeys = true as unknown as __CheckExtraFeatureKeys;
