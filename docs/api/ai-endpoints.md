# AI API エンドポイントリファレンス

PR #448 / #449 で追加された 17 個の AI エンドポイントの仕様一覧。
詳しい設計は [`docs/ai-automation-guide.md`](../ai-automation-guide.md)。

## 共通仕様

すべての admin AI ルートは認証直後に以下の順序で gate を通る:

1. `checkRateLimit(req, "ai")` — 超過時 **429**
2. `resolveCallerWithRole(supabase)` — 認証なし **401**
3. `canUseFeature(planTier, "<feature_key>")` — 不足 **403** `error: "plan_limit"`
4. `parseJsonBody(req, schema)` — 不正 **400**
5. `loadAiAutomationSettings(tenantId)` — `enabled=false` なら **200** `ai_disabled: true` + 元データ返却
6. AI 処理本体
7. `usage.record({outcome, ...})` で `ai_usage_logs` に書き込み + Sentry breadcrumb

`insurer/cases/[id]/ai-*` は insurer 用認証 (`resolveInsurerCaller`) を使い、
プラン制限は適用されない (損保プランは別軸)。

## エンドポイント一覧

### 案件 / 業務

#### `POST /api/admin/jobs/[id]/ai-suggest`

案件 (reservation) のタイトル / 次アクション / タイマー乖離アラートを 1 リクエストで取得。

- Plan: `ai_job_assist` (Standard+)
- Response: `{ ai_disabled, suggestions: { title, nextAction, timerAlert }, context }`

#### `POST /api/admin/customer-messages/[id]/ai-extract`

inbound メッセージから予約候補フィールド (顧客名 / 電話 / 車両 / 希望日 / 希望施工) を抽出し
`customer_messages.ai_extracted` jsonb に保存。

- Plan: `ai_inbound_extract` (Standard+)
- Request: `{}` (body 不要)
- Response: `{ ai_disabled, extracted: { intent, customer_name, phone, ... }, persisted, warning? }`

### 請求 / 見積 / 会計

#### `POST /api/admin/invoices/ai-from-job`

案件 (reservation) → 請求書下書き。

- Plan: `ai_invoice_quote` (Standard+)
- Request: `{ reservation_id: uuid }`
- Response: `{ ai_disabled, draft: { customer_id, vehicle_id, items[], tax_rate, recipient_name, note, ai, confidence } }`

#### `POST /api/admin/quotes/ai-from-vehicle`

車両 + サービスカテゴリ → 見積書下書き。

- Plan: `ai_invoice_quote` (Standard+)
- Request: `{ vehicle_id: uuid, customer_id?: uuid, service_category: string, base_menu?: Array<{name, default_price?}> }`
- Response: `{ ai_disabled, draft: { doc_type: "estimate", items[], total, validity_days, terms, ai, confidence } }`

#### `POST /api/admin/accounting/ai-categorize`

請求明細 → 勘定マスタとの突合 + AI 推定。

- Plan: `ai_accounting` (Standard+)
- Request: `{ fallback_code, accounts: [{code, label, keywords?}], lines: [{description, amount, is_reduced_rate?}] }`
- Response: `{ ai_disabled, lines: [{description, amount, suggested_code, suggested_label, confidence, method}] }`

### 顧客接点

#### `POST /api/admin/customer-inquiries/[id]/ai-classify`

問い合わせ → 8 カテゴリ分類 + 3 段階優先度 + 200〜300 字返信下書き。

- Plan: `ai_inquiry_classify` (Standard+)
- Request: `{}` (body 不要)
- Response: `{ ai_disabled, classification: { category, priority, draft_reply, reason, confidence, ai, policies } }`

#### `POST /api/admin/reservations/ai-from-message`

LINE / メール / 電話文字起こし → 予約フォームへの抽出。

- Plan: `ai_inbound_extract` (Standard+)
- Request: `{ text, channel?: "line"|"email"|"phone"|"form", received_date?: "YYYY-MM-DD" }`
- Response: `{ ai_disabled, extracted: { intent, customer_name?, phone?, vehicle?, scheduled_date?, date_text?, service?, note?, confidence, ai } }`

#### `POST /api/admin/reviews/ai-sentiment`

レビュー本文 + NPS → 3 段階センチメント + 50 字サマリ + 話題タグ + actionable フラグ。

- Plan: `ai_review_sentiment` (Standard+)
- Request: `{ text, nps_score?: 0-10, days_since_certificate? }`
- Response: `{ ai_disabled, sentiment: { sentiment, summary, topics[], actionable, confidence, ai } }`

### 保険会社

#### `POST /api/insurer/cases/[id]/ai-summary`

case → 3 行サマリ (本質 / 進行状況 / 次手)。

- Auth: insurer
- Request: `{}` (body 不要)
- Response: `{ summary: { lines: [string, string, string], confidence, ai } }`

#### `POST /api/insurer/cases/[id]/ai-assign-suggest`

担当者振り分け候補 (ルール → 過去履歴 → AI → fallback の 4 段)。

- Auth: insurer
- Request: `{}` (body 不要)
- Response: `{ candidates: [{user_id, user_name?, score, method, reason}], ai }`

### マスタ / 在庫 / 価格

#### `POST /api/admin/master-data/normalize`

メーカー / 車種 / 住所 / 郵便番号 / 顧客名の表記揺れ正規化 (deterministic 主体)。

- Plan: `ai_master_normalize` (Starter+)
- Request: `{ maker?, model?, address?, postal_code?, customer_name? }`
- Response: `{ ai_disabled, normalized: {maker, model, address, prefecture, postal_code, customer_name} }`

#### `POST /api/admin/square/orders/[id]/ai-link`

Square 注文 → 自店顧客のファジーマッチ。

- Plan: `ai_master_normalize` (Starter+)
- Request: `{}` (body 不要、Square 注文の raw_json から query を抽出)
- Response: `{ ai_disabled, match: { best?: {customer_id, name, score, reasons}, alternatives, confidence, method, ai } }`

#### `POST /api/admin/thickness-reports/[reportId]/ai-anomaly`

塗膜厚レポートの統計分析 + AI コメント。

- Plan: `ai_thickness_anomaly` (Standard+)
- Request: `{ expected_range?: { min, max } }`
- Response: `{ ai_disabled, anomaly: { stats, severity: "ok"|"watch"|"alert", comment, ai } }`

#### `POST /api/admin/inventory/ai-pos-deduct`

POS 売上 → SKU 単位の引落推定 (link / history / ai / fallback)。

- Plan: `ai_pos_deduction` (Standard+)
- Request: `{ sales: [{menu_item_id, menu_item_name, service_category?, sold_quantity}] }`
- Response: `{ ai_disabled, suggestions: [{menu_item_id, sku_id, sku_name, quantity, confidence, method}], ai, warning? }`

#### `POST /api/admin/menu-items/[id]/ai-price`

メニュー → 推奨価格 (自店過去販売中央値 × 車両サイズ係数 + AI 妥当性チェック)。

- Plan: `ai_menu_price` (Standard+)
- Request: `{ vehicle_size?: "SS"|"S"|"M"|"L"|"LL"|"XL" }`
- Response: `{ ai_disabled, recommendation: { recommended_price, band: {min, p50, max}, confidence, rationale, ai } }`

### マーケット / 多言語

#### `POST /api/admin/market-vehicles/[id]/ai-description`

物件説明文 (200〜300 字) + 特徴タグ生成 (写真があれば Vision、なければ text-only)。

- Plan: `ai_market_description` (Standard+)
- Request: `{ seller_notes?, photo_urls?: string[] }`
- Response: `{ ai_disabled, description, features, confidence, ai }`

#### `POST /api/admin/translate`

任意テキスト → en/zh/vi/ko/pt-BR (キャッシュ付き)。

- Plan: `ai_translation` (Standard+)
- Request: `{ text, target_lang: "en"|"zh"|"vi"|"ko"|"pt-BR", tone?: "formal"|"casual"|"marketing", glossary?, kind?: "announcement"|"product_description"|"general" }`
- Response: `{ ai_disabled, translated, confidence, ai, cache_key, cached: boolean }`

### 設定

#### `GET /api/admin/settings/ai-automation`

現在のテナント設定を取得。

- Response: `{ settings: { enabled, fieldPolicies, confidenceThreshold, sourcePolicies }, loadedFromDb, role }`

#### `PUT /api/admin/settings/ai-automation`

ポリシーを更新 (admin 以上)。サニタイズ + diff 監査ログ記録。

- Auth: admin+
- Request: `{ enabled?, fieldPolicies?, confidenceThreshold?, sourcePolicies? }`
- Response: `{ settings: {...}, persisted, warning? }`

#### `GET /api/admin/platform/ai-usage`

運営用の集計エンドポイント。

- Query: `?days=7|30|90` (デフォルト 30)
- Response: `{ stats: { byOutcome, byEndpoint, dailySeries, confidenceHistogram, totalCount, okCount, errorCount, latencyP50, latencyP95 }, days, warning? }`

## エラーレスポンス

すべて統一フォーマット:

```json
{
  "error": "validation_error" | "unauthorized" | "forbidden" | "plan_limit" | "rate_limit" | "not_found" | "internal_error",
  "message": "ユーザ向け日本語メッセージ"
}
```

ステータスコード: 400 / 401 / 403 / 404 / 429 / 500。
