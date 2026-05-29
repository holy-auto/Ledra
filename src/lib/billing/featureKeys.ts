export const FEATURES = {
  manage_templates: "manage_templates",
  upload_logo: "upload_logo",
  export_one_csv: "export_one_csv",
  export_search_csv: "export_search_csv",
  export_selected_csv: "export_selected_csv",
  issue_certificate: "issue_certificate",
  pdf_one: "pdf_one",
  pdf_zip: "pdf_zip",
  manage_stores: "manage_stores",
  // ── AI機能（B-1〜B-4, C-1〜C-4）──
  ai_draft: "ai_draft", // B-1: 証明書自動下書き
  ai_explain: "ai_explain", // B-2: 説明変換（顧客/保険/社内）
  ai_quality: "ai_quality", // B-3: 抜け漏れ検知（基本）
  ai_quality_vision: "ai_quality_vision", // B-3: 写真Vision AI検証
  ai_follow_up: "ai_follow_up", // B-4: フォローAI
  ai_academy_feedback: "ai_academy_feedback", // C-2: Academy添削
  ai_academy_qa: "ai_academy_qa", // C-3: QAアシスタント
  academy_know_how: "academy_know_how", // C-1: 公開事例のノウハウ詳細閲覧 (要約・良点・注意点)
  ai_proposal: "ai_proposal", // ヒアリング提案（既存）
  ai_follow_up_email: "ai_follow_up_email", // フォローメール（既存）
  // ── PR #448: ワークフロー全体の AI 入力代行 ──
  ai_job_assist: "ai_job_assist", // 案件タイトル / 次アクション / タイマー乖離
  ai_invoice_quote: "ai_invoice_quote", // 案件→請求書 / 車両→見積書 起票
  ai_accounting: "ai_accounting", // 仕訳科目推定 (freee / マネーフォワード)
  ai_inquiry_classify: "ai_inquiry_classify", // 問い合わせ分類 + 返信下書き
  ai_inbound_extract: "ai_inbound_extract", // 受信メッセージ → 予約フォーム抽出
  ai_review_sentiment: "ai_review_sentiment", // レビュー / NPS センチメント
  ai_master_normalize: "ai_master_normalize", // 表記揺れ正規化 / 顧客ファジーマッチ
  ai_thickness_anomaly: "ai_thickness_anomaly", // 塗膜厚レポート異常検知
  ai_pos_deduction: "ai_pos_deduction", // POS チェックアウト → 在庫引落推定
  ai_menu_price: "ai_menu_price", // メニュー推奨価格
  ai_market_description: "ai_market_description", // マーケット車両説明文 (Vision)
  ai_translation: "ai_translation", // 多言語翻訳 (en/zh/vi/ko/pt-BR)
  // ── Pro 限定機能（料金プラン詳細資料 p.3 の比較表ベース）──
  audit_log: "audit_log", // 管理者向け監査ログ閲覧
  api_integration: "api_integration", // 外部 API キー発行 / Webhook 連携
  detailed_reports: "detailed_reports", // 詳細レポート (Standard は基本レポートのみ)
} as const;

export type FeatureId = keyof typeof FEATURES;
