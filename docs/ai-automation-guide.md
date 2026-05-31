# AI 自動入力ガイド

PR #448 / #449 で実装されたワークフロー横断の AI 自動入力基盤の運用ガイド。
テナント運営者・開発者・運営チーム向け。

## 1. 概要

Ledra のワークフロー (証明書 / 案件 / 請求 / 顧客 / 保険 case / 在庫 / マーケット車両 etc) に対して、
フィールド単位で「AI が自動入力する / AI が提案するが人が承認する / AI に触らせず手動」を
切り替えられる仕組み。

- **目的**: 入力工数の削減 + コスト管理 + コンプライアンス
- **規模**: 20+ API ルート、30+ フィールド、16 ワークフロー、7 auto-actions (全 7 ライブ配線済み / 壁3 で 6 アクションは自動化禁止)
- **設定 UI**: `/admin/settings/ai-automation` (admin 以上が編集)
- **運営ダッシュボード**: `/admin/platform/operations` の「AI 利用状況」セクション

## 2. ポリシーモデル

### 2.1 フィールド単位 (3-way)

| ポリシー    | 挙動                                              |
| ----------- | ------------------------------------------------- |
| **auto**    | AI 出力をそのままフォームに反映 (確認なし)        |
| **suggest** | AI が下書きを生成し、ユーザが「適用」を押すと反映 |
| **manual**  | AI を呼ばない (該当フィールドは空のまま)          |

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

## 4.5 イベント駆動の自動実行 (auto-actions)

field_policies が「フィールドを AI が埋めるか」を制御するのに対し、**auto-actions** は
「人がフォームを開かなくてもワークフローを前に進めるか」(= 受信 / 状態遷移をきっかけに
AI を自動実行するか) を制御する。これが「利用者の入力頻度を限りなく 0 に」の本丸。

- 定義: `src/lib/ai/automation/actionCatalog.ts`
- 解決: `resolveAutoAction(settings, key)` (`policy.ts`)
- 永続化: `tenant_ai_automation_settings.auto_actions` jsonb (migration 20260531000001)
- 設定 UI: `/admin/settings/ai-automation` の「AUTO-ACTIONS」セクション
- **すべて既定 OFF (opt-in)**。Standard プラン以上で有効化可能。

| アクションキー                            | 内容                                                                 | 既定 | 配線状況                       |
| ----------------------------------------- | -------------------------------------------------------------------- | ---- | ------------------------------ |
| `inbound_message.auto_extract`            | LINE 等の受信時に予約候補を自動抽出し受信箱に下書き化 (コミットなし) | OFF  | ✅ LINE webhook                |
| `inbound_message.auto_create_reservation` | 高確信 + 既知顧客 + 有効日 + new_reservation のとき予約を自動起票    | OFF  | ✅ LINE webhook                |
| `certificate.auto_draft`                  | 案件完了 + 車両ありで証明書ドラフトを自動生成 (発行なし)             | OFF  | ✅ 予約完了 (PUT reservations) |
| `certificate.auto_create_draft_record`    | 案件完了 + 車両 + 顧客名ありで証明書を status=draft の行として自動起票 (発行=draft→active は人 / 壁3) | OFF | ✅ 予約完了 (PUT reservations) |
| `review.auto_analyze`                     | レビュー受信時に感情分析を自動付与                                   | OFF  | ✅ 受領サインレビュー POST     |
| `translation.auto_translate`              | 店舗お知らせ保存時に多言語へ自動翻訳                                 | OFF  | ✅ 店舗お知らせ保存 (POST/PUT) |
| `invoice.auto_send_on_confirm`            | 請求書を人が確定 (draft→sent) した時点で顧客へ自動送付 (決済リンク+書類) | OFF  | ✅ documents PUT (draft→sent)  |
| `quote.auto_send_on_confirm`              | 見積書を人が確定 (draft→sent) した時点で顧客へ自動送付 (書類リンク)   | OFF  | ✅ documents PUT (draft→sent)  |
| `accounting.auto_categorize_on_intake`    | 案件登録時にメニュー明細から勘定科目を推定し「提案」を保存 (計上=確定は人 / 壁3) | OFF | ✅ 予約作成 (POST reservations) |
| `thickness.auto_detect`                   | 塗膜厚レポート受信時に統計的な異常検知を自動付与 (注釈)              | OFF  | ✅ NexPTG 同期 (POST external/nexptg/sync) |
| `workflow.auto_propose_on_intake`         | 案件登録時にメニュー+過去履歴から最適ワークフローを「提案」(適用=進行開始は人) | OFF | ✅ 予約作成 (POST reservations) |
| `inventory.auto_draft_reorder`            | 在庫下限割れ時に仕入先ごとの発注書を draft で自動起票 (承認・送信は人 / 壁3) | OFF | ✅ 低在庫 cron (low-stock-alerts) |

> **certificate.auto_draft の配線**: 予約 (案件) が `completed` になった時点で
> `maybeAutoDraftCertificateForReservation` (fire-and-forget) が走り、車両 + 過去事例から
> 下書きを生成して `reservations.ai_certificate_draft` に保存する。証明書の行は作らず、
> 既に下書きがある予約は上書きしない。発行は必ず人 (壁3)。写真は生成に使わない
> (`generateCertificateDraft` が photoDescriptions 未使用のため、トリガーは「完了 + 車両」)。
>
> **review.auto_analyze の配線**: `POST /api/signature/review/[token]` でコメント付き
> レビューを受信した時点で `maybeAutoAnalyzeReview` が走り、`signature_reviews` の
> AI 列 (sentiment/summary/topics/actionable/confidence) に保存する。
>
> **translation.auto_translate の配線**: 新設の「店舗お知らせ」機能
> (`shop_announcements` テーブル + `/api/admin/shop-announcements` CRUD + 管理 UI
> `/admin/shop-announcements`) で、お知らせの作成 / 更新時に
> `maybeAutoTranslateShopAnnouncement` (fire-and-forget) が走り、title/body を
> 英・中・越へ翻訳して `shop_announcements.translations` に保存する (translationCache 活用)。
> 顧客は `/customer/[tenant]` の「お知らせ」タブで言語を切り替えて閲覧でき、公開 API は
> `GET /api/announcements/shop?tenant=<slug>&lang=<ja|en|zh|vi>`。原文 (日本語) が常に正。
>
> **invoice.auto_send_on_confirm / quote.auto_send_on_confirm の配線**: 帳票は
> `documents` テーブル (status: draft→sent→…) で管理され、`PUT /api/admin/documents` で
> 人がステータスを **draft→sent (= 確定/送付済み)** に変更した瞬間に
> `maybeAutoSendDocumentOnConfirm` (`documentAuto.ts`, fire-and-forget) が走る。
> 顧客のチャネルを自動選択 (LINE 連携あり→LINE / 無ければメール、**LINE 送信失敗時は
> メールにフォールバック**) し、請求書は **Stripe Connect 決済リンク + 書類**、見積書は
> **書類リンク** を送付して `document_share_log` に記録する。送付前に
> `idempotency_key=auto-confirm:<id>` で **'pending' 行をアトミックに予約**
> (部分 UNIQUE インデックス `uq_doc_share_log_auto_confirm`) し、draft→sent の
> レース (ダブルクリック等) でも二重送付しない。失敗時は予約を解放してリトライ可能。
> **金額/内容の「確定」そのものは必ず人 (draft→sent は人の操作) = 壁3 を維持**。
> 自動課金 (payment.auto_charge) は行わず、決済はあくまで顧客の操作。

> **certificate.auto_create_draft_record の配線**: `certificate.auto_draft` (下書き JSON 生成)
> の一歩先。予約 PUT で `status="completed"` になると、まず下書き JSON を生成し、続いて
> `maybeAutoCreateDraftCertificateForReservation` (`certificateRecordAuto.ts`) が **証明書を
> status=draft の行として起票**する (`reservations.ai_certificate_id` で冪等化 / 二重起票防止)。
> 顧客名が取れない案件 (本人確認不能) や車両なしの案件では作らない。**発行 (draft→active =
> 法的確定) は必ず人**が行う (`certificate.auto_issue` は NEVER_AUTO のまま)。
>
> **accounting.auto_categorize_on_intake の配線**: 予約 POST で案件が登録された時点で
> `maybeAutoCategorizeReservationOnIntake` (`accountingAuto.ts`, fire-and-forget) が走り、
> `menu_items_json` の明細を既定チャート (売上高/部品売上/立替金/雑収入) に rule→AI の
> 二段で当て、`reservations.ai_accounting_suggestion` に **「提案」として保存**する。
> `accounting.category` は NEVER_AUTO_FIELD のため、これは提案であって帳簿への計上 (確定)
> ではない。**金額・科目の確定は必ず人**が行う (壁3)。
>
> **thickness.auto_detect の配線**: NexPTG 膜厚計同期 (`POST /api/external/nexptg/sync`) で
> レポートを受信すると、レスポンス送出後に `after()` 経由で
> `maybeAutoDetectThicknessForReports` (`thicknessAuto.ts`) が走り、測定値を統計解析して
> `thickness_reports.ai_anomaly_result` に保存する (1 sync あたり最大 50 レポート)。
> sentiment 同様、注釈用途で金額・本人確認・法的確定には一切関与しない (壁3 対象外)。
>
> **workflow.auto_propose_on_intake の配線**: 予約 POST で案件が登録されると
> `maybeAutoProposeWorkflowForReservation` (`workflowAuto.ts`, fire-and-forget) が走り、
> メニュー内容 (`workflowProposal.ts` のキーワード判定) と顧客/車両の過去案件で使われた
> service_type から最適なワークフローテンプレートを 1 つ提案し、
> `reservations.ai_workflow_proposal` に保存する。これは **提案** であって自動適用ではない。
> スタッフが承認 (既存の `start-workflow`) または別テンプレートに変更してから進行する
> (= 人が判断)。既に進行中 (`workflow_template_id` あり) の案件には提案しない。
>
> **inventory.auto_draft_reorder の配線**: 日次 cron `/api/cron/low-stock-alerts` の
> テナントごとループから `maybeAutoDraftReordersForTenant` (`reorderAuto.ts`) が走り、
> 現在庫が下限 (`min_stock`) を下回り **かつ仕入先 (`supplier_id`) が設定済み** の品目を
> 仕入先ごとにまとめて **発注書 (`purchase_orders`, status=draft / source=auto)** を起票する。
> 数量は `inventory_items.reorder_qty` (既定ロット) があればそれ、無ければ下限までの不足分
> (`reorder.ts`, 純関数)。冪等性は部分 UNIQUE インデックス `uq_po_auto_open_per_supplier`
> (1 仕入先につき同時に開いている auto 下書きは 1 つ) で担保。
> **発注の承認 (approve) / 送信 (sent = 仕入先へメール) / 入荷 (received = 在庫 in 計上) は
> すべて人の操作** (`PUT /api/admin/purchase-orders`)。自動で発注を確定・外部送信することは
> しない (壁3: 仕入先への金額コミットは必ず人)。仕入先マスタは `/api/admin/suppliers`。

### 4.5.1 LINE 受信 → 自動処理パイプライン

`POST /api/line/webhook` → `handleWebhookEvents` (200 即返し後の非同期) →
`maybeAutoProcessInboundMessage` (`inboundAuto.ts`, fail-soft):

1. `loadAiAutomationSettings` → `shouldAutoExtractInbound` (opt-in 判定)
2. プラン (Standard+) / `is_active` 確認
3. `extractInboundReservation` → `customer_messages.ai_extracted` に保存 (受信箱に下書き)
4. `decideInboundCommit` が許せば予約を自動起票 (壁3 遵守)

## 4.6 壁3 — 必ず人の確認を挟む領域

「金額確定 / 本人確認 / 法的責任」は、設定で auto / true にしても **絶対に自動化しない**。
アプリ層 (`resolveFieldPolicy` / `resolveAutoAction`) と sanitizer の二重で強制する。

- **フィールド (NEVER_AUTO_FIELDS, `fieldCatalog.ts`)**: `auto` を指定しても必ず `suggest` に
  クランプ (確認必須)。対象 = 金額確定 (`invoice.items` / `invoice.tax_rate` /
  `job.estimated_price` / `quote.items` / `menu.recommended_price` / `accounting.category` /
  `inventory.pos_deduction`) + 本人確認 (`customer.{name,name_kana,birth_date,phone,email,address}` /
  `vehicle.vin`)。
- **アクション (NEVER_AUTO_ACTIONS, `actionCatalog.ts`)**: `resolveAutoAction` が常に false。
  対象 = `certificate.auto_issue` (発行) / `invoice.auto_send` / `invoice.auto_finalize` /
  `payment.auto_charge` / `quote.auto_send` / `customer.auto_create` (スタッフ操作だけでの本人レコード自動作成)。
- **低確信**: confidence_threshold 未満は auto でも `suggest` にデモート (既存挙動)。

> **「確定後の送付」と「無ゲート送付」の区別**: `invoice.auto_send` / `quote.auto_send`
> (= 人の確認を一切挟まない送付) は壁3 のまま禁止。一方、`invoice.auto_send_on_confirm` /
> `quote.auto_send_on_confirm` は **人が draft→sent に確定した後だけ** 送るため壁3 ではなく
> opt-in 可。金額/内容の確定は常に人が握る。
>
> **顧客作成の本人確認**: スタッフ操作だけの `customer.auto_create` は壁3 で禁止のまま。
> ただし公開 intake フロー (`/intake/[short_id]`) は **顧客本人が** OCR (`/api/identity/ocr`)
> で読み取った内容を確認画面で確定するため、本人確認が成立する別ルート。送信時に
> `submitAndProcessIntake` が検証 (`intakeValidator`) を通せば自動で `customers` を作成
> (`approved_by=NULL`)、連絡先の部分一致・検証 NG はスタッフレビュー (needs_review) に回す。

→ 自動起票される予約は「既知顧客のみ・金額 0・タイトルに【要確認】」で、本人確認と金額確定は
人に残る。証明書も「ドラフトまで自動・発行は人」。

## 4.7 フィールド別 confidence

`generateCertificateDraft` は draft 全体の `confidence` に加え、項目別の
`fieldConfidence` (title / description / materials / warranty / workAreas / cautions) を返す。
`filterDraftByPolicy` は項目別値があればそれで、無ければ draft 全体値でデモート判定する。
「説明文は自信があるが材料は曖昧」のとき、材料だけ `suggest` に落とし、説明文は `auto` を維持できる。

## 4.8 自動化レベルのフィードバックループ

`ai_usage_logs` の実績 (件数・平均確信度) から「auto 化してよいか」を推薦する。

- ロジック: `recommendAutoActions(rows, settings)` (`feedbackLoop.ts`, 純関数)
- API: `GET /api/admin/settings/ai-automation/recommendations?days=30`
- 判定: サンプル ≥ 20 かつ平均確信度 ≥ 0.8 → `enable_auto` (opt-in 推奨) /
  閾値未満 → `needs_attention` / 既に有効 → `already_auto` / それ以外 → `keep` / `insufficient_data`
- **壁3 は推薦対象外** (ENDPOINT_META に含めない)。

これで「実データで安全側を確認 → opt-in」を繰り返し、入力ゼロの天井を徐々に押し上げられる。

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

| 機能キー                                    | Free | Starter | Standard | Pro |
| ------------------------------------------- | ---- | ------- | -------- | --- |
| `ai_master_normalize` (辞書ベース、AI 最小) | ✗    | ✓       | ✓        | ✓   |
| `ai_job_assist`                             | ✗    | ✗       | ✓        | ✓   |
| `ai_invoice_quote`                          | ✗    | ✗       | ✓        | ✓   |
| `ai_accounting`                             | ✗    | ✗       | ✓        | ✓   |
| `ai_inquiry_classify`                       | ✗    | ✗       | ✓        | ✓   |
| `ai_inbound_extract`                        | ✗    | ✗       | ✓        | ✓   |
| `ai_review_sentiment`                       | ✗    | ✗       | ✓        | ✓   |
| `ai_thickness_anomaly`                      | ✗    | ✗       | ✓        | ✓   |
| `ai_pos_deduction`                          | ✗    | ✗       | ✓        | ✓   |
| `ai_menu_price`                             | ✗    | ✗       | ✓        | ✓   |
| `ai_market_description`                     | ✗    | ✗       | ✓        | ✓   |
| `ai_translation`                            | ✗    | ✗       | ✓        | ✓   |

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

| 症状                             | 原因 / 対処                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| 設定変更しても反映されない       | テーブル `tenant_ai_automation_settings` のマイグレーション未適用 → migration 20260528000003 を実行 |
| ダッシュボードが「未作成」と表示 | `ai_usage_logs` migration (20260529000002) 未適用                                                   |
| AI 提案が一切表示されない        | (1) プラン不足 (2) master switch OFF (3) 全フィールド manual に設定されている                       |
| 「429 rate_limited」が頻発       | テナント単位 20 req/min を超過 — UI 側でデバウンス必要                                              |
| 翻訳が遅い                       | cache 未ヒット → 同じ原文 × 言語 × トーンを 2 回目以降叩くとキャッシュヒット                        |

## 11. 関連ファイル

- 設定基盤: `src/lib/ai/automation/{fieldCatalog,policy}.ts`
- 自動実行: `src/lib/ai/automation/{actionCatalog,orchestrator,inboundAuto,reviewAuto,certificateAuto,announcementAuto,documentAuto}.ts`
- 帳票 確定→自動送付: `documentAuto.ts` + `app/api/admin/documents` PUT (draft→sent 検出) + `lib/documents/share-email.ts` / `lib/line/client.ts` / `lib/stripe/invoicePaymentLink.ts`
- 顧客セルフ確認 intake: `app/intake/[short_id]/IntakeClient.tsx` (確認ステップ) + `app/api/intake/[short_id]/submit` + `lib/identity/intakeServer.ts` (`submitAndProcessIntake`)
- 店舗お知らせ: `shop_announcements` テーブル / `app/api/admin/shop-announcements` / `app/admin/shop-announcements` / `app/api/announcements/shop` (公開) / 顧客ポータル「お知らせ」タブ
- フィードバックループ: `src/lib/ai/automation/feedbackLoop.ts` + `recommendations/route.ts`
- LINE 受信配線: `src/lib/line/client.ts` (`handleWebhookEvents`)
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
- **PR (P4)**: イベント駆動 auto-actions + 壁3 ガードレール (field/action) + per-field confidence
  - LINE 受信→自動抽出/自動起票 + 自動化レベル推薦 (feedbackLoop)
  - review.auto_analyze (受領サインレビューの自動感情解析) 配線 + レビュー一覧 UI (/admin/reviews)
  - certificate.auto_draft (案件完了時の証明書ドラフト自動生成、発行は人=壁3) 配線 + 案件画面表示
  - 店舗お知らせ機能 (shop_announcements + CRUD + 管理 UI + 顧客ポータル多言語表示) と
    translation.auto_translate 配線 → auto-actions 5/5 ライブ化
