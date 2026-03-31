export const FEATURES = {
  manage_templates: "manage_templates",
  upload_logo: "upload_logo",
  "export_one_csv": "export_one_csv",
  "export_search_csv": "export_search_csv",
  "export_selected_csv": "export_selected_csv",
  "issue_certificate": "issue_certificate",
  "pdf_one": "pdf_one",
  "pdf_zip": "pdf_zip",
  "manage_stores": "manage_stores",
  // ── AI機能（B-1〜B-4, C-1〜C-4）──
  "ai_draft":             "ai_draft",             // B-1: 証明書自動下書き
  "ai_explain":           "ai_explain",           // B-2: 説明変換（顧客/保険/社内）
  "ai_quality":           "ai_quality",           // B-3: 抜け漏れ検知（基本）
  "ai_quality_vision":    "ai_quality_vision",    // B-3: 写真Vision AI検証
  "ai_follow_up":         "ai_follow_up",         // B-4: フォローAI
  "ai_academy_feedback":  "ai_academy_feedback",  // C-2: Academy添削
  "ai_academy_qa":        "ai_academy_qa",        // C-3: QAアシスタント
  "ai_proposal":          "ai_proposal",          // ヒアリング提案（既存）
  "ai_follow_up_email":   "ai_follow_up_email",   // フォローメール（既存）
} as const;

export type FeatureId = keyof typeof FEATURES;
