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

/** テンプレートオプション料金 */
export const TEMPLATE_OPTIONS = {
  preset: {
    name: "ブランド証明書 ライト",
    price: "¥3,300",
    unit: "月",
    setupFee: "¥16,500",
    description: "既製テンプレートをベースに、自社ロゴ・ブランドカラーを反映した施工証明書を発行",
    features: [
      "既製テンプレートから選択",
      "ロゴ・社名の反映",
      "ブランドカラー設定",
      "保証文言の軽微な調整",
      "メンテナンスURL / QRコード",
      "テスト発行（月3回）",
    ],
  },
  custom: {
    name: "ブランド証明書 プレミアム",
    price: "¥4,400",
    unit: "月",
    setupFee: "¥88,000",
    description: "専任担当がヒアリングの上、貴社専用のオリジナル施工証明書テンプレートを制作",
    features: [
      "専任担当によるヒアリング",
      "オリジナルデザイン制作",
      "ロゴ・ブランドカラー反映",
      "保証文言・注意文言カスタム",
      "レイアウト調整",
      "メンテナンスURL / QRコード",
      "テスト発行（月5回）",
      "初回修正対応込み",
    ],
    recommended: true,
  },
} as const;

/** テンプレートオプション 追加作業費 */
export const TEMPLATE_ADDITIONAL_WORK = [
  { item: "文言修正", price: "¥5,500〜" },
  { item: "レイアウト調整", price: "¥11,000〜" },
  { item: "QR/URL差し替え", price: "¥3,300〜" },
  { item: "テンプレート追加制作", price: "¥33,000〜¥55,000" },
  { item: "大幅再設計", price: "別途お見積り" },
] as const;

/** テンプレートオプション FAQ */
export const TEMPLATE_FAQ = [
  {
    question: "既存のプランと併用できますか？",
    answer: "はい。現在ご利用中のプラン（スターター/スタンダード/エンタープライズ）に追加する形でご利用いただけます。",
  },
  {
    question: "途中でライトからプレミアムに変更できますか？",
    answer: "はい。プレミアムへのアップグレードは随時承ります。ライトの初期費用はプレミアム初期費用から差し引きます。",
  },
  {
    question: "解約した場合、テンプレートはどうなりますか？",
    answer: "解約後はCARTRUST標準テンプレートに切り替わります。カスタムテンプレートのデータは30日間保持され、再契約時に復元可能です。",
  },
  {
    question: "証明書の必須項目を非表示にできますか？",
    answer: "いいえ。お客様名・車両情報・施工内容・CARTRUST認証マーク等の必須項目は、証明書としての信頼性を担保するため非表示にできません。",
  },
  {
    question: "保証文言の内容はチェックしてもらえますか？",
    answer: "保証文言・注意文言の法的妥当性は加盟店様にてご確認ください。弁護士レビューは含まれておりません。",
  },
] as const;

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
