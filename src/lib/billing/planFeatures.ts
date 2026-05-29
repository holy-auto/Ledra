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
    academy_know_how: false,
    ai_proposal: false,
    ai_follow_up_email: false,
    // ── PR #448 拡張 AI: Free は全て不可 ──
    ai_job_assist: false,
    ai_invoice_quote: false,
    ai_accounting: false,
    ai_inquiry_classify: false,
    ai_inbound_extract: false,
    ai_review_sentiment: false,
    ai_master_normalize: false,
    ai_thickness_anomaly: false,
    ai_pos_deduction: false,
    ai_menu_price: false,
    ai_market_description: false,
    ai_translation: false,
    audit_log: false,
    api_integration: false,
    detailed_reports: false,
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
    academy_know_how: true,
    ai_proposal: false,
    ai_follow_up_email: false,
    // ── PR #448 拡張 AI: Starter は軽量な決定論ベースのみ ──
    ai_job_assist: false,
    ai_invoice_quote: false,
    ai_accounting: false,
    ai_inquiry_classify: false,
    ai_inbound_extract: false,
    ai_review_sentiment: false,
    ai_master_normalize: true, // 辞書ベースが主体で AI コール最小限
    ai_thickness_anomaly: false,
    ai_pos_deduction: false,
    ai_menu_price: false,
    ai_market_description: false,
    ai_translation: false,
    audit_log: false,
    api_integration: false,
    detailed_reports: false,
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
    academy_know_how: true,
    ai_proposal: true,
    ai_follow_up_email: true,
    // ── PR #448 拡張 AI: Standard で全解禁 ──
    ai_job_assist: true,
    ai_invoice_quote: true,
    ai_accounting: true,
    ai_inquiry_classify: true,
    ai_inbound_extract: true,
    ai_review_sentiment: true,
    ai_master_normalize: true,
    ai_thickness_anomaly: true,
    ai_pos_deduction: true,
    ai_menu_price: true,
    ai_market_description: true,
    ai_translation: true,
    audit_log: false,
    api_integration: false,
    detailed_reports: false,
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
    academy_know_how: true,
    ai_proposal: true,
    ai_follow_up_email: true,
    // ── PR #448 拡張 AI: Pro も全解禁 ──
    ai_job_assist: true,
    ai_invoice_quote: true,
    ai_accounting: true,
    ai_inquiry_classify: true,
    ai_inbound_extract: true,
    ai_review_sentiment: true,
    ai_master_normalize: true,
    ai_thickness_anomaly: true,
    ai_pos_deduction: true,
    ai_menu_price: true,
    ai_market_description: true,
    ai_translation: true,
    audit_log: true,
    api_integration: true,
    detailed_reports: true,
  },
};

export function normalizePlanTier(v: string | null | undefined): PlanTier {
  const s = String(v ?? "").toLowerCase();
  if (s === "free") return "free";
  if (s === "starter" || s === "mini") return "starter";
  if (s === "standard") return "standard";
  if (s === "pro") return "pro";
  return "free";
}

export function canUseFeature(planTier: string | null | undefined, feature: FeatureKey): boolean {
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
    case "academy_know_how":
      return "Academy ノウハウ閲覧";
    case "ai_proposal":
      return "AIヒアリング提案";
    case "ai_follow_up_email":
      return "AIフォローメール";
    case "ai_job_assist":
      return "AI案件アシスト";
    case "ai_invoice_quote":
      return "AI請求書 / 見積書 起票";
    case "ai_accounting":
      return "AI仕訳科目推定";
    case "ai_inquiry_classify":
      return "AI問い合わせ分類";
    case "ai_inbound_extract":
      return "AIメッセージ → 予約抽出";
    case "ai_review_sentiment":
      return "AIレビュー解析";
    case "ai_master_normalize":
      return "マスタ正規化";
    case "ai_thickness_anomaly":
      return "AI塗膜厚異常検知";
    case "ai_pos_deduction":
      return "AI在庫引落推定";
    case "ai_menu_price":
      return "AI推奨価格";
    case "ai_market_description":
      return "AI物件説明文生成";
    case "ai_translation":
      return "AI多言語翻訳";
    case "audit_log":
      return "監査ログ";
    case "api_integration":
      return "API連携";
    case "detailed_reports":
      return "詳細レポート";
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
