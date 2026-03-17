/**
 * マーケティングページ共通の料金プラン定義
 * 料金・制限の変更はここだけ修正すれば全ページに反映される
 */

export const PLANS = {
  starter: {
    name: "スターター",
    price: "無料",
    unit: "",
    description: "まずは試してみたい方に",
    certLimit: "月5件まで証明書発行",
    certLimitShort: "月5件",
    features: [
      "月5件まで証明書発行",
      "基本テンプレート",
      "URL共有",
      "メールサポート",
    ],
    ctaLabel: "無料で始める",
  },
  standard: {
    name: "スタンダード",
    price: "¥9,800",
    unit: "/月",
    description: "本格的に活用したい施工店に",
    certLimit: "月100件まで証明書発行",
    certLimitShort: "月100件",
    features: [
      "月100件まで証明書発行",
      "カスタムテンプレート",
      "ロゴ・ブランドカスタマイズ",
      "CSV/PDFエクスポート",
      "優先サポート",
    ],
    recommended: true,
  },
  enterprise: {
    name: "エンタープライズ",
    price: "要相談",
    unit: "",
    description: "大規模導入・API連携をお考えの方に",
    certLimit: "無制限の証明書発行",
    certLimitShort: "無制限",
    features: [
      "無制限の証明書発行",
      "API連携",
      "専用アカウントマネージャー",
      "カスタム開発対応",
      "SLA保証",
    ],
    ctaLabel: "お問い合わせ",
  },
} as const;

/** 年間契約の割引率 */
export const ANNUAL_DISCOUNT_PERCENT = 20;

/** プラン別機能比較テーブルデータ */
export const FEATURE_COMPARISON = [
  { feature: "証明書発行数", starter: PLANS.starter.certLimitShort, standard: PLANS.standard.certLimitShort, enterprise: PLANS.enterprise.certLimitShort },
  { feature: "テンプレート", starter: "基本", standard: "カスタム", enterprise: "完全カスタム" },
  { feature: "ブランドカスタマイズ", starter: "—", standard: "✓", enterprise: "✓" },
  { feature: "URL共有", starter: "✓", standard: "✓", enterprise: "✓" },
  { feature: "CSV/PDFエクスポート", starter: "—", standard: "✓", enterprise: "✓" },
  { feature: "API連携", starter: "—", standard: "—", enterprise: "✓" },
  { feature: "サポート", starter: "メール", standard: "優先メール", enterprise: "専任マネージャー" },
  { feature: "SLA保証", starter: "—", standard: "—", enterprise: "✓" },
] as const;
