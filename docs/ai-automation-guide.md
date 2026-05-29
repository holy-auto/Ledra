# AI 自動入力ガイド

PR #448 / #449 で実装されたワークフロー横断の AI 自動入力基盤の運用ガイド。
テナント運営者・開発者・運営チーム向け。

## 1. 概要

Ledra のワークフロー (証明書 / 案件 / 請求 / 顧客 / 保険 case / 在庫 / マーケット車両 etc) に対して、
フィールド単位で「AI が自動入力する / AI が提案するが人が承認する / AI に触らせず手動」を
切り替えられる仕組み。

- **目的**: 入力工数の削減 + コスト管理 + コンプライアンス
- **規模**: 17 API ルート、30+ フィールド、4+ ワークフロー
- **設定 UI**: `/admin/settings/ai-automation` (admin 以上が編集)
- **運営ダッシュボード**: `/admin/platform/operations` の「AI 利用状況」セクション

## 2. ポリシーモデル

### 2.1 フィールド単位 (3-way)

| ポリシー | 挙動 |
|---|---|
| **auto** | AI 出力をそのままフォームに反映 (確認なし) |
| **suggest** | AI が下書きを生成し、ユーザが「適用」を押すと反映 |
| **manual** | AI を呼ばない (該当フィールドは空のまま) |

### 2.2 グローバル設定

- **enabled (master switch)**: false にすると、フィールド設定にかかわらず全 AI 自動入力を停止
- **confidence_threshold (0.0〜1.0、デフォルト 0.5)**: AI 自己評価値がこの値を下回ったフィールドは
  `auto` に設定されていても `suggest` に降格される (manual はそのまま)
- **source_policies**: AI が参照可能な情報ソース (写真 / ヒアリング / 過去事例 / 音声メモ / 身分証 OCR / 顧客履歴) を ON/OFF

### 2.3 フィールドカタログ

`src/lib/ai/automation/fieldCatalog.ts` が唯一の真実。主要キー:

- `certificate.{title, description, materials, warranty, work_areas, cautions}`
- `vehicle.{maker, model, year, vin, plate_display, size_class, expiry_date, fuel_type}`
- `customer.{name, name_kana, birth_date, address, postal_code, phone, email, requests}`
- `job.{title, menu_items, estimated_price, estimated_duration, next_action, notes}`
- `invoice.{items, recipient_name, note, tax_rate}`
- `quote.{items, terms, validity_days}`
- `accounting.category`
- `inquiry.{category, priority, draft_reply}`
- `inbound_message.{scheduled_date, customer_name, vehicle, service_request}`
- `review.{sentiment, summary, topics}`
- `insurer_case.{assignee, summary}`
- `master_data.{maker_model, address, customer_fuzzy_match}`
- `inventory.{pos_deduction, thickness_anomaly}`
- `menu.recommended_price`
- `market_vehicle.{description, features}`
- `translation.{announcement, product_description}`

## 3. 永続化

```sql
-- tenant_ai_automation_settings (PR #448)
tenant_id              uuid PRIMARY KEY
enabled                boolean DEFAULT true
field_policies         jsonb  -- { "certificate.title": "auto", ... }
confidence_threshold   numeric(3,2) DEFAULT 0.50
source_policies        jsonb  -- { "photos": false, ... }
```

```sql
-- ai_usage_logs (PR #449)
tenant_id / insurer_id (どちらか必須)
endpoint, model, outcome, input/output_tokens, confidence, latency_ms, meta
```

```sql
-- ai_translation_cache (PR #P3)
cache_key PRIMARY KEY  -- = translationCacheKey(text, lang, tone)
translated_text, model, confidence, hit_count, last_accessed_at
```

## 4. 各層の責務

```
UI (Panel / Button / Sandbox)
   ↓ fetch POST /api/admin/*/ai-*
API ルート
   ↓ checkRateLimit("ai") → resolveCallerWithRole → canUseFeature → loadAiAutomationSettings
AI ヘルパ (src/lib/ai/*)
   ↓ withRetry("anthropic", ...) → Anthropic SDK
Anthropic API
   ← レスポンス
ポリシー filter (filterDraftByPolicy 等)
   ↓ manual の field を空に戻す
クライアント
```

## 5. 監視

### 5.1 AI 利用ダッシュボード

`/admin/platform/operations` の「AI 利用状況」セクションで以下を 7/30/90 日切替で確認:

- KPI: 総コール / 成功率 / レイテンシ P50/P95 / 累計トークン
- エンドポイント別表: コール数 / 平均信頼度 / 入出力トークン
- 日次推移バー
- 信頼度ヒストグラム (10 段階)
- Outcome バッジ (ok / ai_disabled / plan_limit / rate_limit / schema_error / error)

### 5.2 監査ログ

ポリシー変更は `vehicle_histories` テーブルに以下の type で記録:

- `ai_settings_changed` (before/after diff を description に含む)
- `ai_suggestion_generated` / `ai_suggestion_applied` / `ai_suggestion_rejected`

既存の `/admin/audit` ページから閲覧可。

### 5.3 Sentry breadcrumb

`recordRouteUsage` 経由で全 AI コールの breadcrumb が Sentry に積まれる。
本番エラー発生時、Sentry の Issue 詳細で「直前に何の AI を叩いたか」を
endpoint / outcome / latency / confidence 付きで確認できる。

### 5.4 GDPR データエクスポート

`/api/admin/data-export` のレスポンスに以下 2 セクションが含まれる:

- `ai_automation_settings`: テナント単位のポリシースナップショット
- `ai_usage_logs_recent`: 直近 1000 件の AI コール履歴

個人情報保護法第33条 / GDPR 第15条の開示要求にそのまま使える。

## 6. プラン制限

| 機能キー | Free | Starter | Standard | Pro |
|---|---|---|---|---|
| `ai_master_normalize` (辞書ベース、AI 最小) | ✗ | ✓ | ✓ | ✓ |
| `ai_job_assist` | ✗ | ✗ | ✓ | ✓ |
| `ai_invoice_quote` | ✗ | ✗ | ✓ | ✓ |
| `ai_accounting` | ✗ | ✗ | ✓ | ✓ |
| `ai_inquiry_classify` | ✗ | ✗ | ✓ | ✓ |
| `ai_inbound_extract` | ✗ | ✗ | ✓ | ✓ |
| `ai_review_sentiment` | ✗ | ✗ | ✓ | ✓ |
| `ai_thickness_anomaly` | ✗ | ✗ | ✓ | ✓ |
| `ai_pos_deduction` | ✗ | ✗ | ✓ | ✓ |
| `ai_menu_price` | ✗ | ✗ | ✓ | ✓ |
| `ai_market_description` | ✗ | ✗ | ✓ | ✓ |
| `ai_translation` | ✗ | ✗ | ✓ | ✓ |

プラン不足は `apiPlanLimit()` で 403 `error: "plan_limit"` を返す。
クライアントは「Standard プラン以上で利用可」のヒントを表示する。

## 7. レート制限

- 全 16 admin AI ルートに `ai` プリセット (20 req / 60s / tenant)
- `master-data/normalize` のみ `general` (60/60s) — CSV import で大量ループ呼び想定

超過時は 429 `error: "rate_limit"` を返す。
UI は「しばらくお待ちください」を表示し、リトライ可能にする。

## 8. テスト戦略

- **Pure functions**: `src/lib/ai/__tests__/*.test.ts` — deterministic fallback / clip / sizeMultiplier 等を unit test
- **Route handler**: `src/app/api/admin/__tests__/ai-routes-gate.test.ts` — 16 ルート × 5 ケース
  (401 / 403 plan_limit / 429 rate_limit / 200 ai_disabled / 400 schema_error)
- **Settings route**: `src/app/api/admin/__tests__/ai-settings-route.test.ts` — sanitize / soft-fail / role guard

合計 1687 テスト (2026-05-30 時点)。

## 9. よくある運用シナリオ

### 9.1 「新規テナントで AI を試したい」

1. テナント作成直後はデフォルト設定 (enabled=true, fieldPolicies={}) で起動
2. 各フィールドは catalog の `defaultPolicy` (主に "suggest") で動く
3. 信頼度 threshold は 0.5 — まず低めで運用感を掴む

### 9.2 「請求書の宛名は AI に任せたいが、金額は人が見る」

設定ページで:
- `invoice.recipient_name` → **auto**
- `invoice.items` → **suggest** (デフォルト)
- `invoice.tax_rate` → **suggest** (デフォルト)

### 9.3 「コスト爆発を防ぎたい」

- master switch を **OFF** にすれば即座に全 AI 停止
- source_policies の `photos` を OFF → Vision コール (Sonnet) を停止
- confidence_threshold を **0.8** に上げる → 確実な推論のみ採用、それ以外は suggest 表示で AI コール削減

### 9.4 「保険会社の監査で AI 利用履歴を提出したい」

- `/admin/data-export` を実行 → ZIP 内に `ai_automation_settings` + `ai_usage_logs_recent` が含まれる
- 期間別の集計は `/admin/platform/operations` のスクリーンショットで補完

## 10. トラブルシューティング

| 症状 | 原因 / 対処 |
|---|---|
| 設定変更しても反映されない | テーブル `tenant_ai_automation_settings` のマイグレーション未適用 → migration 20260528000003 を実行 |
| ダッシュボードが「未作成」と表示 | `ai_usage_logs` migration (20260529000002) 未適用 |
| AI 提案が一切表示されない | (1) プラン不足 (2) master switch OFF (3) 全フィールド manual に設定されている |
| 「429 rate_limited」が頻発 | テナント単位 20 req/min を超過 — UI 側でデバウンス必要 |
| 翻訳が遅い | cache 未ヒット → 同じ原文 × 言語 × トーンを 2 回目以降叩くとキャッシュヒット |

## 11. 関連ファイル

- 設定基盤: `src/lib/ai/automation/{fieldCatalog,policy}.ts`
- AI ヘルパ: `src/lib/ai/*.ts` (17 モジュール)
- 共通 util: `src/lib/ai/utils.ts` (clipText / clipZenkaku / sizeMultiplier)
- Sentry: `src/lib/ai/sentryAiBreadcrumb.ts`
- 利用ログ: `src/lib/ai/{usageLog,recordRouteUsage}.ts`
- 監査: `src/lib/audit/aiAuditLog.ts`
- 翻訳キャッシュ: `src/lib/ai/translationCache.ts`
- 設定 UI: `src/app/admin/settings/ai-automation/`
- ダッシュボード: `src/app/admin/platform/operations/AiUsageDashboard.tsx`

## 12. 関連 PR

- **PR #448**: 自動入力基盤 + フィールドカタログ + 17 API ルート + UI 統合
- **PR #449**: 統合テスト + 監査ログ + 利用集計 + GDPR エクスポート拡張
- **PR (P3)**: 共通 util 抽出 + Sentry breadcrumb + 翻訳キャッシュ + 本ガイド
