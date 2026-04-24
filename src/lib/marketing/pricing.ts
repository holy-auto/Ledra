/**
 * マーケティングページ共通の料金プラン定義
 * 料金・制限の変更はここだけ修正すれば全ページに反映される
 */

export const PLANS = {
  free: {
    name: "フリー",
    price: "¥0",
    unit: "/月",
    description: "まずは試してみたい方に",
    certLimit: "月10件まで証明書発行",
    certLimitShort: "月10件",
    features: [
      "月10件まで発行",
      "基本テンプレート",
      "URL共有・QR対応",
      "車両・顧客台帳",
      "保険会社ポータル",
      "メールサポート",
    ],
    ctaLabel: "無料で始める",
  },
  starter: {
    name: "スターター",
    price: "¥9,800",
    unit: "/月",
    annualPrice: "¥94,080",
    annualUnit: "/年",
    description: "本格的に活用を始めたい施工店に",
    certLimit: "月80件まで証明書発行",
    certLimitShort: "月80件",
    features: [
      "月80件まで発行",
      "基本テンプレート＋ロゴ",
      "CSV/PDF単体出力",
      "車両・顧客台帳",
      "保険会社ポータル",
      "メールサポート",
    ],
  },
  standard: {
    name: "スタンダード",
    price: "¥24,800",
    unit: "/月",
    annualPrice: "¥238,080",
    annualUnit: "/年",
    setupFee: "¥29,800",
    description: "複数店舗・チーム運用に最適",
    certLimit: "月300件まで証明書発行",
    certLimitShort: "月300件",
    features: [
      "月300件まで発行",
      "カスタムテンプレート",
      "CSV/PDF一括出力",
      "2店舗・7ユーザーまで",
      "基本レポート",
      "保険会社ポータル",
      "優先サポート",
    ],
    recommended: true,
  },
  pro: {
    name: "プロ",
    price: "¥49,800",
    unit: "/月",
    annualPrice: "¥478,080",
    annualUnit: "/年",
    setupFee: "¥49,800",
    description: "大規模運用・API連携をお考えの方に",
    certLimit: "無制限の証明書発行",
    certLimitShort: "無制限",
    features: [
      "無制限の証明書発行",
      "フルカスタムテンプレート",
      "5店舗・15ユーザーまで",
      "詳細レポート・監査ログ",
      "API連携",
      "保険会社ポータル",
      "専任サポート",
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
    answer: "はい。現在ご利用中のプラン（フリー/スターター/スタンダード/プロ）に追加する形でご利用いただけます。",
  },
  {
    question: "途中でライトからプレミアムに変更できますか？",
    answer: "はい。プレミアムへのアップグレードは随時承ります。ライトの初期費用はプレミアム初期費用から差し引きます。",
  },
  {
    question: "解約した場合、テンプレートはどうなりますか？",
    answer:
      "解約後はLedra標準テンプレートに切り替わります。カスタムテンプレートのデータは30日間保持され、再契約時に復元可能です。",
  },
  {
    question: "証明書の必須項目を非表示にできますか？",
    answer:
      "いいえ。お客様名・車両情報・施工内容・Ledra認証マーク等の必須項目は、証明書としての信頼性を担保するため非表示にできません。",
  },
  {
    question: "保証文言の内容はチェックしてもらえますか？",
    answer: "保証文言・注意文言の法的妥当性は加盟店様にてご確認ください。弁護士レビューは含まれておりません。",
  },
] as const;

/** 年間契約の割引率 */
export const ANNUAL_DISCOUNT_PERCENT = 20;

/** オプション料金 */
export const ADD_ON_OPTIONS = {
  additionalStore: { name: "追加店舗", price: "¥4,980", unit: "/店舗/月" },
  additionalUser: { name: "追加ユーザー", price: "¥1,480", unit: "/人/月" },
  prioritySupport: { name: "優先サポート", price: "¥4,980", unit: "/月" },
  onboarding: { name: "導入伴走", price: "¥19,800", unit: "/月", packPrice: "¥49,800", packUnit: "/3ヶ月" },
} as const;

/** NFCタグ料金 */
export const NFC_TAG_PRICING = {
  freeAllocation: 20,
  packs: [
    { quantity: 10, price: "¥980" },
    { quantity: 30, price: "¥2,480" },
    { quantity: 100, price: "¥6,980" },
  ],
} as const;

/** 初期100店舗キャンペーン */
export const LAUNCH_CAMPAIGN = {
  slug: "launch_100",
  maxSlots: 100,
  plans: ["standard", "pro"] as const,
  durationMonths: 12,
  nfcFreeAllocation: 30,
  description: "初期100店舗限定キャンペーン（初年度のみ適用・Standard/Pro対象）",
} as const;

/** プラン別機能比較テーブルデータ */
export const FEATURE_COMPARISON = [
  {
    feature: "証明書発行数",
    free: PLANS.free.certLimitShort,
    starter: PLANS.starter.certLimitShort,
    standard: PLANS.standard.certLimitShort,
    pro: PLANS.pro.certLimitShort,
  },
  { feature: "店舗数", free: "1", starter: "1", standard: "2", pro: "5" },
  { feature: "ユーザー数", free: "1", starter: "3", standard: "7", pro: "15" },
  { feature: "テンプレート", free: "基本", starter: "基本+ロゴ", standard: "カスタム", pro: "フルカスタム" },
  { feature: "保険会社ポータル", free: "✓", starter: "✓", standard: "✓", pro: "✓" },
  { feature: "CSV/PDFエクスポート", free: "—", starter: "単体のみ", standard: "✓", pro: "✓" },
  { feature: "レポート", free: "—", starter: "—", standard: "基本", pro: "詳細" },
  { feature: "API連携", free: "—", starter: "—", standard: "—", pro: "✓" },
  { feature: "監査ログ", free: "—", starter: "—", standard: "—", pro: "✓" },
  { feature: "サポート", free: "メール", starter: "メール", standard: "優先", pro: "専任" },
] as const;
