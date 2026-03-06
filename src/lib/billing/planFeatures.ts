export type PlanTier = "mini" | "standard" | "pro";

export type FeatureKey = FeatureId;

/**
 * - 不明な plan_tier は "pro" 扱い（UIは緩く→実際の制限はAPI/402で止める）
 * - ここは「見た目の制限」(ボタン無効/画面無効) 用のマトリクス
 */
const MATRIX: Record<PlanTier, Record<FeatureKey, boolean>> = {
  mini: {
    issue_certificate: true,
    export_one_csv: true,
    export_search_csv: false,
    export_selected_csv: false,
    pdf_one: true,
    pdf_zip: false,
    manage_templates: false,
    upload_logo: false,
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
  },
};

export function normalizePlanTier(v: any): PlanTier {
  const s = String(v ?? "").toLowerCase();
  if (s === "mini") return "mini";
  if (s === "standard") return "standard";
  return "pro";
}

export function canUseFeature(planTier: any, feature: FeatureKey): boolean {
  const tier = normalizePlanTier(planTier);
  return !!MATRIX[tier]?.[feature];
}

export function featureLabel(feature: FeatureKey): string {
  switch (feature) {
    case "issue_certificate": return "証明書の新規作成";
    case "export_one_csv": return "CSV出力（単体）";
    case "export_search_csv": return "CSV出力（検索結果）";
    case "export_selected_csv": return "CSV出力（選択分）";
    case "pdf_one": return "PDF出力（単体）";
    case "pdf_zip": return "PDF ZIP出力（選択分）";
    case "manage_templates": return "テンプレート管理";
    case "upload_logo": return "ロゴアップロード";
    default: return feature;
  }
}
