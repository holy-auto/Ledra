# 外部依存マトリクス

> 目的: Ledra から呼び出す外部サービスについて、**criticality / fail-mode /
> retry / idempotency / timeout / 監視 / runbook 参照** を 1 枚に集約する。
> 関連: `docs/slo.md` (SLI/SLO)、`docs/internal/operations-runbook.md` (障害対応)、
> `docs/disaster-recovery.md` (Supabase DR)、`docs/operations/rate-limits.md`。
>
> 更新ポリシー: 新規外部サービスを足すとき / 既存サービスの fail-mode を
> 変えるときは **このファイルを必ず更新**する (PR テンプレに項目あり予定)。

---

## 1. 全体方針

### 1.1 Criticality 定義

`docs/internal/operations-runbook.md` §1 の障害レベルと整合する。

| Lv | 定義 | 例 | デフォルト fail-mode |
|----|------|----|----|
| **P0** | サービス全停止 / データ漏洩 / 整合性喪失 | Supabase 完全停止、Stripe webhook 完全配信不能 | **closed** (即座にユーザーへ提示) |
| **P1** | 主要機能停止 (証明書発行・決済確定) | Stripe Checkout 起動失敗、Polygon 本番 anchor 連続失敗 | **closed** |
| **P2** | 重要機能の degrade (PDF 出力遅延、通知遅延) | Resend 遅延、QStash 配信遅延、batch-pdf 失敗 | **open** (キューに退避、後追いリトライ) |
| **P3** | 補助機能の停止 (LINE 通知、Slack 通知、分析) | LINE push 失敗、PostHog 落ち、Slack lead 通知欠落 | **open** (握りつぶし + 監視ログ) |

### 1.2 Fail-mode 原則

**3 つのルールで判定する**:

1. **「ユーザーが今この瞬間に対価を支払う/支払った」処理は fail-closed**。
   ・例: Stripe Checkout 起動、Terminal capture、Tap to Pay → 失敗時はユーザーに即時エラーを返す。リトライは UI レベル。
2. **「事後でも整合性が取れる」処理は fail-open + 後追い**。
   ・例: 会計仕訳投入、Polygon anchoring、batch-pdf → outbox / QStash dedup で吸収。
3. **「失敗しても顧客の業務が止まらない」処理は fail-open + 監視ログ**。
   ・例: LINE 通知、Slack lead 通知、PostHog 分析 → fire-and-forget。ただし `Sentry.captureSecurityEvent` / `logger.warn` で必ず痕跡を残す。

**重要な反例**:
- 通知系でも **OTP メール (Resend) は fail-closed**。届かないとログインできないため。
- 決済系でも **Stripe webhook 受信は fail-open**。Stripe 側のリトライで結果整合。

### 1.3 Retry / Backoff 共通則

`src/lib/http/withRetry.ts:83` の `withRetry(key, thunk, opts)` を **下記対象は必ず経由**する:

- 対象: Stripe SDK / Anthropic SDK / Polygon RPC / Cloudflare Stream / Resend REST / QStash publish / Square API / freee / MF / Twilio
- 既定: 4 attempts、initial 250ms、multiplier 2、max 8s、±20% jitter
- 自動リトライ対象: 408/425/429/5xx、`ECONNRESET`/`ETIMEDOUT`/`ENOTFOUND`/`EAI_AGAIN`、`fetch failed`
- Circuit breaker: 5 連続失敗で 30 秒 open (`CircuitOpenError` を throw)

**採用パターン (Proxy / 関数ラップ)**:
- **Stripe SDK** (`src/lib/stripe/client.ts`): `getStripeClient()` が返す Stripe インスタンスを **Proxy で包み、`RETRYABLE_METHODS` (create/retrieve/update/list/...) に該当する関数呼び出しを自動的に `withRetry("stripe", ...)` で経由**。call site の変更は不要。SDK 側 `maxNetworkRetries: 0` で二重リトライ無効化。
- **Anthropic SDK** (`src/lib/ai/client.ts`): 全 14 モジュールで `withRetry("anthropic", () => client.messages.parse(...))` を明示。SDK 側 `maxRetries: 0`。
- **Polygon RPC** (`src/lib/anchoring/providers/polygon.ts`): viem の `readContract` / `getLogs` / `waitForTransactionReceipt` を `withRetry("polygon-rpc", ...)` でラップ。**`writeContract` は除外** (nonce が進む = 別 tx 生成で duplicate anchor リスク)。
- **Cloudflare Stream** (`src/lib/video/cloudflareStream.ts`): `cfsFetch` 内で 5xx/429 を throw、`withRetry("cf-stream", ...)` でラップ。4xx は permanent として Response 透過。

**対象外** (理由付き):
- Supabase Postgrest クライアント: pooler + クライアント側 retry を内蔵。`withRetry` で二重リトライにならないよう wrap **しない**。
- Stripe `webhooks.constructEvent`: 署名検証は permanent エラー (retry しても結果同じ) なので Proxy の `RETRYABLE_METHODS` から除外。
- Polygon `walletClient.writeContract`: nonce 問題で retry 不可。失敗時は cron 次回実行で `findAnchorTx` により重複検知。

### 1.4 Idempotency 必須範囲

| 種別 | 仕組み | 場所 |
|------|--------|------|
| Stripe webhook | `stripe_processed_events` で event_id claim → 重複は 200 (no-op) | `src/app/api/stripe/webhook/route.ts:462-515` |
| 証明書発行 (POST) | `cert_idempotency_keys` テーブル | `src/lib/certificates/*` |
| QStash publish | `deduplicationId` 必須 (`square-sync:init:{job_id}` 等) | `src/lib/qstash/publish.ts:29-50` |
| Resend send | `Idempotency-Key` header | `src/lib/email/resendSend.ts` |
| Outbox | `outbox_events.event_id` UNIQUE 制約 | `src/lib/outbound-webhooks.ts` |

**現状ギャップ**: Square webhook / LINE webhook / Resend webhook / CloudSign webhook
が dedup 用のテーブルを持っているか個別に未整理 → §4。

### 1.5 Timeout 方針

- **明示済**: Stripe (30s, `src/lib/stripe/client.ts`)、Anthropic (60s, `src/lib/ai/client.ts`)、AI route の Vercel `maxDuration` (60s)。
- **未明示**: Resend / Square / QStash / Polygon RPC (viem 既定) / freee / MF / Twilio / gBizINFO。
- SLO L2 (API p99 < 1500ms) を守るため、エンドユーザーが待つ系のパスで未明示は要対応。
- → §4 で残りの timeout 明示をアクション化。

---

## 2. サービス一覧 (overview)

| Service | Lv | Default fail-mode | Retry | Idempotency | Timeout | SLO | Runbook |
|---|---|---|---|---|---|---|---|
| **Supabase** (Auth/DB/Storage) | P0 | closed | pooler 内蔵 | RLS + DB UNIQUE | — | A2 | `disaster-recovery.md`, `operations-runbook.md` §2.1 |
| **Stripe** (Checkout/Connect/Terminal/Webhook) | P1 | closed (起動) / open (webhook) | **withRetry ✓** (Proxy 自動ラップ) | `stripe_processed_events` + key 4 mutation | **30s** | A2, B1 | `operations-runbook.md` §2.2, §2.4 |
| **Anthropic** (OCR/AI) | P3 (UX 影響あり) | open (graceful fallback) / closed (Vision) | **withRetry ✓** (全 14 モジュール) | structured outputs で構造的排除 | **60s** | — | — |
| **Polygon RPC** (anchoring) | P2 | open (skip & retry next cron) | **withRetry ✓** (read/receipt) / 除外 (writeContract: nonce) | tx hash 重複検知 | viem 既定 | — | — |
| **Cloudflare Stream / Mux** | P2 | closed (動画提出系) | **withRetry ✓** (5xx/429 retry, 4xx 透過) | — | — | — | — |
| **Resend** (Email) | P2 (OTP は P1) | open (transactional) / closed (OTP) | 独自 backoff (3回) + **SendGrid フォールバック ✓** (`sendEmail` 統一 adapter) | `Idempotency-Key` | — | C1 | `operations-runbook.md` §2.3 |
| **SendGrid** (Email fallback) | P2 | open (Resend が落ちた時のみ呼ばれる) | **withRetry ✓** | (Resend と同経路) | 15s | — | — |
| **QStash** (async queue) | P2 | open (キュー退避) | retries: 2 + dedup | `deduplicationId` 必須 | — | B3 | — |
| **Upstash Redis** (rate-limit/cache) | P3 | open (`RATE_LIMIT_FAIL_CLOSED=0`) / closed (=1) | — | — | — | — | `operations/rate-limits.md` |
| **Square** (POS sync) | P3 | open (部分同期継続) | API 429/401 を error 値で記録 | — | — | — | — |
| **LINE Messaging API** | P3 (重要通知は P2) | open (時効性通知) / **closed-ish** (重要通知は SMS フォールバック) | **withRetry ✓** (`clientWithRetry.ts` 重要通知のみ) | `recordOutboundLineMessage` で記録 + UI バッジ | — | — | — |
| **Twilio** (SMS) | P2 (OTP セカンダリ / LINE 代替) | open (fire-and-forget) / closed (OTP) | **withRetry ✓** | typed result | 10s | — | — |
| **freee / マネーフォワード** (会計) | P3 | open (cron next round) | — | OAuth token refresh | — | — | — |
| **Google Calendar** | P3 | open | — | OAuth | — | — | — |
| **CloudSign** (電子署名 webhook) | P3 | open (webhook idempotent) | — | event id dedup (要確認) | — | — | — |
| **Sentry** | P3 (観測のみ) | open (silent .catch) | — | — | — | — | — |
| **Slack Incoming Webhook** | P3 (lead は P2) | open | **withRetry ✓** | — | 5s | — | — |
| **PostHog** | P3 | open (client-side) | SDK 内蔵 | — | — | — | — |
| **gBizINFO** | P3 | open | **withRetry ✓** | — | 5s | — | — |
| **Pinata** (IPFS) | P3 | open (skip pin) | — | content addressing で自然冪等 | — | — | — |
| **Hive** (Deepfake) | P3 (任意) | open (provider disabled) | — | — | — | — | — |

凡例: **withRetry ✓** = `withRetry` を経由している。**なし** = リトライロジック自体が存在しない。

---

## 3. 機能 × 依存マトリクス

「機能」= FEATURES.md と `src/app/` の route ベース。失敗時の振る舞いは **観察された現状** を記述する (理想ではなく)。

### 3.1 決済 / 課金系

#### サブスクリプション課金 (テナント / 保険会社)
- **依存**: Stripe (Checkout, Subscription, Customer Portal), Supabase, Resend
- **起動経路**: `POST /api/stripe/checkout`, `POST /api/stripe/portal`, `POST /api/stripe/resume`, `POST /api/template-options/subscribe`
- **Webhook 経路**: `POST /api/stripe/webhook` (`checkout.session.completed`, `customer.subscription.*`, `invoice.*`)
- **失敗時の現状**:
  - Stripe API が落ちて Checkout 起動失敗 → 500 をユーザーに返す。**ユーザー視点ではエラーページのみ、リトライ動線なし** → GAP
  - Webhook 受信失敗 → 503 を返却して Stripe にリトライ要求 (`webhook/route.ts:503-515`)
  - DB 書込み失敗 → `apiInternalError` + Sentry。Stripe 側は完了済のため `/api/cron/monitor` の課金不整合チェックで翌朝検知
- **ユーザー可視 degrade**: Checkout 起動エラーは即時可視。Webhook 遅延は管理画面上「プラン状態が反映されない」として現れる
- **既知ギャップ**:
  - Checkout 起動失敗時のユーザー向けエラー文言 / リトライ動線
  - `withRetry("stripe", ...)` 未経由 → 一過性 5xx に脆い

#### Stripe Connect 決済 (施工店宛て送金)
- **依存**: Stripe Connect, Supabase
- **起動経路**: `POST /api/stripe/connect`, `POST /api/stripe/connect/payment-link`, `POST /api/agent/stripe-connect`
- **Webhook**: `POST /api/stripe/webhook` (Connect events; `STRIPE_CONNECT_WEBHOOK_SECRET` 別)
- **失敗時の現状**: Checkout と同じ。Transfer/Payout のイベントは現状ログのみで管理画面表示なし
- **ギャップ**: Payout 失敗の運営側可視化が薄い

#### Stripe Terminal (実店舗 POS)
- **依存**: Stripe Terminal API
- **起動経路**: `POST /api/admin/pos/terminal/connection-token`, `/capture`, `/api/mobile/pos/terminal/*`
- **Fail-mode**: **closed**。レジ前の顧客を待たせる性質上、ユーザー (店員) に即時エラーが必須
- **既知ギャップ**: connection-token の失敗時、モバイルアプリ側でのリトライ UI 整備状況が文書化されていない (`docs/tap-to-pay-distribution-checklist.md` 参照)

#### Apple Tap to Pay
- **依存**: Stripe Terminal (Tap to Pay), Apple Attestation
- **起動経路**: `POST /api/mobile/pos/tap-to-pay/*`
- **Fail-mode**: **closed**
- **特記**: `DEVICE_ATTESTATION_ENABLED=true` 時のみ attestation 検証が走る

#### Stripe Webhook (idempotency)
- **依存**: Stripe → Supabase (`stripe_processed_events`)
- **idempotency**: `INSERT ... ON CONFLICT` で event_id claim、重複は 200 即返却 (`webhook/route.ts:500`)
- **monitor**: `/api/cron/stripe-event-monitor` で 24h 内の処理件数を記録、`operations-runbook.md` §1.1 の補完監視
- **Fail-mode**: open (Stripe のリトライで吸収)
- **GAP**: Connect 別 secret (`STRIPE_CONNECT_WEBHOOK_SECRET`) の events が monitor に集計されているか要確認

### 3.2 通知系

#### OTP メール (顧客ログイン)
- **依存**: Resend
- **起動経路**: `POST /api/customer/request-code`
- **Fail-mode**: **closed** (届かないとログイン不能のため、Resend retry で 3 回まで → 失敗時はユーザーに「再送」表示)
- **SLO**: C1 (request → 受信ログ < 60s)
- **GAP**: Resend が落ちた場合のフォールバック (SMS, 別 ESP) は **無い**。30 分以上の全断は致命的

#### トランザクションメール (決済失敗通知 / trial-will-end / 解約)
- **依存**: Resend, Stripe webhook (trigger)
- **起動経路**: Stripe webhook ハンドラ内から `sendEmail()`
- **Fail-mode**: open (リトライで吸収しきれなければログ。経営判断で再送は手動)
- **GAP**: 配信失敗の dead-letter キューがない (Outbox に乗っているか要確認)

#### Resend Webhook (bounce / complaint)
- **依存**: Resend → Supabase
- **起動経路**: `POST /api/webhooks/resend`
- **Fail-mode**: open
- **GAP**: idempotency key 未整理

#### LINE Push (予約確認 / リマインダー / 進捗 / 帳票リンク)
- **依存**: LINE Messaging API (tenant 別 channel)
- **起動経路**: `src/lib/line/client.ts` の `sendBookingConfirmation/Reminder/ProgressUpdate/...`
- **Fail-mode**: **open (全て握りつぶし)**。`recordOutboundLineMessage(delivered=false, failureReason)` のみ
- **特記**: tenant 単位で LINE config が暗号化 DB 列、未設定なら `return false`
- **既知ギャップ** (議論対象):
  - 「重要な通知 (作業完了など) も握りつぶしで良いか」が機能別に決まっていない
  - 失敗の集計ダッシュボード / 閾値アラートが未整備
  - `withRetry` 未経由 → 一過性 5xx で恒久失敗扱いになる

#### LINE Webhook (顧客 → 店舗の inbound)
- **依存**: LINE → Supabase
- **起動経路**: `POST /api/line/webhook`
- **署名検証**: timing-safe HMAC (`src/lib/line/client.ts:108-121`)
- **Fail-mode**: open (LINE 側 retry あり)

#### SMS (Twilio)
- **依存**: Twilio
- **起動経路**: `src/lib/sms/client.ts:5-34`
- **Fail-mode**: open (boolean return, fire-and-forget)
- **GAP**: retry なし、idempotency なし、配信ログ未整備。**現状の用途と criticality を要確認**

#### Slack 通知 (lead / signup / inquiry)
- **依存**: 4 種類の Slack Incoming Webhook
- **起動経路**: 各フォーム / signup ハンドラから直接 fetch
- **Fail-mode**: open (未設定なら skip)
- **GAP**: lead 通知の欠落は売上機会損失だが、retry/監視なし

### 3.3 証明書ライフサイクル系

#### 証明書発行
- **依存**: Supabase, (任意) Pinata IPFS, (任意) Polygon RPC, Anthropic (品質チェック時)
- **起動経路**: `POST /api/admin/certificates` ほか
- **idempotency**: `cert_idempotency_keys` テーブル
- **Fail-mode**: DB は closed、IPFS / Polygon は open (cron で後追い)
- **monitor**: `/api/cron/monitor` で 24h 発行数の異常を検知

#### 証明書 PDF 出力 (単発)
- **依存**: Supabase Storage, Remotion
- **SLO**: C2 (issue → PDF available < 5s)
- **Fail-mode**: closed (ユーザーがダウンロード待ち)

#### バッチ PDF 出力
- **依存**: QStash, Supabase Storage
- **起動経路**: `POST /api/admin/certificates/batch-pdf` (rate-limit: auth)
- **キュー**: `enqueueBatchPdf` (retries: 2, dedup: `batch-pdf:{job_id}`)
- **Fail-mode**: open + キュー (ユーザーに「処理中」表示)

#### ブロックチェーンアンカリング
- **依存**: Polygon RPC (viem), Supabase
- **起動経路**: `/api/cron/polygon-signer` (定期), `/api/admin/polygon/backfill` (手動)
- **Fail-mode**:
  - `POLYGON_ANCHOR_ENABLED !== "true"` → no-op (DISABLED_RESULT)
  - RPC エラー → skip、次回 cron で再試行
  - **本番 mainnet で連続失敗時の警告経路が薄い** → GAP G5
- **Retry** (commit `<this PR>`):
  - `verifyAnchor` (readContract): `withRetry("polygon-rpc", ...)` 経由
  - `findAnchorTx` (getLogs): `withRetry("polygon-rpc", ...)` 経由
  - `waitForTransactionReceipt`: `withRetry("polygon-rpc", ...)` 経由 (既知 tx hash の poll = idempotent)
  - **`writeContract` は対象外**: nonce が進む = 別 tx 生成で duplicate anchor リスク。失敗時は cron 次回で `findAnchorTx` により重複検知して回避。
- **Wallet 監視**: `polygon-signer` cron が POL 残高を `POLYGON_WALLET_WARN_BALANCE_POL` / `_ALERT_` で監視、Resend メール通知

#### NFC タグ書込み / 読込
- **依存**: モバイル端末 NFC、Supabase
- **Fail-mode**: closed (端末画面に即時エラー)

### 3.4 AI / OCR 系

**共通基盤** (commit `8567da6`, `fd6b740`, `86fb7fc`):
- 全 14 モジュールが `messages.parse({ output_config: { format: zodOutputFormat(...) } })` 経由で zod schema 強制 → パース失敗を構造的に排除
- 全 SDK 呼び出しが `withRetry("anthropic", () => ...)` 経由 (SDK 内蔵 retry は `maxRetries: 0` で無効化、二重化防止)
- SDK timeout: **60s**、AI route の Vercel `maxDuration`: **60s** に統一明示
- throw → graceful fallback に統一 (draftCertificate / explainCertificate / academyFeedback)

**モデル選定マトリクス**:

| 機能 | モデル | 理由 |
|---|---|---|
| 車検証 OCR (`shakensho.ts`) | Sonnet 4.6 (要 Opus 4.7 検討) | Vision、印字密度高。Opus 4.7 の高解像度 Vision (2576px) で精度改善余地あり |
| 写真品質チェック (`photoQualityCheck.ts`) | Sonnet 4.6 | Vision、品質判定 |
| 写真改ざん検知 (`photoTamperingCheck.ts`) | Sonnet 4.6 | Vision、誤判定リスク中。EXIF ファーストパスで保険業務影響を軽減 |
| ビフォーアフター差分 (`beforeAfterDiff.ts`) | Sonnet 4.6 | Vision、公開ページ表示 |
| 証明書下書き / 説明変換 / 添削 (`draftCertificate.ts` / `explainCertificate.ts` / `academyFeedback.ts`) | Sonnet 4.6 | 長文生成、品質重要 |
| QA アシスタント (`qaAssistant.ts`) | Sonnet 4.6 | RAG、品質中 |
| 音声メモ整形 / 顧客サマリ / フォローアップ / 不正評価 / BtoB 推薦 | Haiku 4.5 | 短文・コスト優先 |

**Prompt caching の対象** (`cache_control: { type: "ephemeral" }`):
- `shakensho.ts` system prompt (~3600 tokens 推定) ✓
- `academyFeedback.ts` (main) system prompt (~1900 tokens、ボーダー) ✓
- 他は最小キャッシュ閾値 (Sonnet 4.6: 2048 / Haiku 4.5: 4096) 未達のため見送り

#### 各機能の fail-mode
- **車検証 OCR**: closed → **open (graceful)** に変更。raw=null 時 confidence=low で empty を返す
- **写真品質チェック / 写真改ざん検知 / フォローアップ / 音声メモ / 顧客サマリ / 不正評価 / BtoB**: open (fallback)
- **ビフォーアフター差分**: closed (admin 手動トリガで明示エラーが必要)
- **証明書下書き / 説明変換 / 添削**: open (EMPTY_DRAFT / emptyExplanation / EMPTY_FEEDBACK を返却)

### 3.5 外部データ取り込み / 連携系

#### Square POS 売上同期
- **依存**: Square OAuth, Square Orders API
- **起動経路**: `/api/cron/square-sync` (定期), `/api/qstash/square-sync` (async dispatch)
- **Fail-mode**:
  - Token refresh 失敗 → null return + cron log
  - 429 → `rate_limited` 値で記録、**部分同期継続**
  - 401 → `unauthorized` 値で記録 (再認可促す)
- **GAP**: 401 発生時のテナントへの通知 (再認可リンク) が未整備

#### 会計仕訳 (freee / MF)
- **依存**: freee OAuth, MF OAuth, Supabase (encrypted token)
- **起動経路**: `/api/cron/accounting-sync` (日次 3 回)
- **Fail-mode**: open (次回 cron で再試行)
- **GAP**: 連続失敗時の通知

#### Google Calendar 予約連携
- **依存**: Google OAuth
- **Fail-mode**: open
- **GAP**: token 期限切れ時の再認可フロー

#### CloudSign 電子署名 Webhook
- **依存**: CloudSign → Supabase
- **起動経路**: webhook 受信
- **Fail-mode**: open
- **GAP**: idempotency key の整理状況を要確認

#### gBizINFO (法人番号検証)
- **依存**: gBizINFO API
- **起動経路**: テナント / 顧客の法人検証時
- **Fail-mode**: open (検証 skip して入力値を採用)
- **GAP**: API 上限 / retry なし

#### 動画生成 (Remotion + Cloudflare Stream / Mux)
- **依存**: Cloudflare Stream API (現状), 将来 Mux
- **起動経路**: `POST /api/admin/academy/lessons/[id]/video/upload-url` (createDirectUpload), `POST /api/webhooks/video/[provider]` (parseWebhook)
- **Fail-mode**: closed (アップロード提出系)
- **Retry**: `cfsFetch` 内で 5xx/429 throw → `withRetry("cf-stream", ...)` 経由 (commit `<this PR>`)。4xx は permanent として Response 透過。
- **特記**: `parseWebhook` は HMAC 検証のみで API call なし、retry 対象外

### 3.6 監視 / インフラ系

#### Sentry エラー監視
- **依存**: Sentry
- **起動経路**: dynamic import (`src/lib/observability/sentry.ts:27-39`)
- **Fail-mode**: silent (load 失敗は .catch で握りつぶし)
- **特記**: SLO 違反検知のソースなので Sentry 自身が落ちると盲点。`/api/cron/monitor` での補完監視と二重化 (`operations-runbook.md` §1.1)

#### `/api/cron/monitor` (Sentry 補完監視)
- **依存**: Supabase, Resend, Stripe
- **起動経路**: 毎日 08:00 JST
- **Fail-mode**: open (失敗自体は次の日のログで気付く)
- **GAP**: monitor 自身の連続失敗を検知する別系統がない (二重盲点)

#### Rate Limit (Upstash Redis)
- **依存**: Upstash Redis REST
- **Fail-mode**: env `RATE_LIMIT_FAIL_CLOSED` で切替 (default `0` = open + Sentry / `1` = closed 503)
- **詳細**: `docs/operations/rate-limits.md`

#### Outbox / Outbound Webhooks
- **依存**: Supabase (`outbox_events`), QStash (drain)
- **起動経路**: `/api/cron/outbox-flush`
- **Fail-mode**: open (24h 以内 99% 配送を SLO B3 で担保)
- **特記**: ここのみ `withRetry` 経由

---

## 4. ギャップサマリー (アクション候補)

優先度は P0/P1 機能への影響度 × 実装コストで主観評価。

### 4.1 高優先 (P0/P1 機能のリスク)

| # | 課題 | 提案 | 規模 |
|---|------|------|------|
| ~~G1~~ | ~~Stripe SDK 呼び出しが `withRetry` 未経由~~ | ✅ **解消** (commit `e58f5bf`): 共有 `getStripeClient()` + Proxy で全 SDK call を自動ラップ。重要 mutation 4 件に `idempotencyKey` 追加 | — |
| ~~G2~~ | ~~Anthropic SDK timeout 600s デフォルト~~ | ✅ **解消** (commit `86fb7fc`, `8567da6`): SDK timeout 60s、Vercel `maxDuration` 60s、`withRetry("anthropic", ...)` 全 14 モジュール経由 | — |
| G3 | Checkout 起動失敗のユーザー向けエラー / リトライ動線が薄い | 共通 ErrorBoundary + リトライボタン、Sentry breadcrumb 充実 | 中 |
| ~~G4~~ | ~~OTP メール (Resend) 全断時のフォールバックなし~~ | ✅ **解消** (commit `313640a`): `src/lib/email/sendEmail.ts` 統一 adapter で Resend → SendGrid → (G9 連動) Twilio SMS の 3 重化 | — |

### 4.2 中優先 (P2 機能の信頼性)

| # | 課題 | 提案 |
|---|------|------|
| ~~G5~~ | ~~Polygon 本番連続失敗時の警告が薄い~~ | ✅ **解消** (commit `<this PR>`): `failureTracker` で 3 連続失敗 + 6h cooldown でメール通知。RPC retry は別途 ✅ 済 |
| G6 | ~~Square 401 (token 失効) のテナントへの通知~~ (cron 連続失敗通知は ✅ 解消 commit `<this PR>`) | テナントへの個別通知 (再認可リンク) は別途 UI 改修必要 |
| ~~G7~~ | ~~freee / MF 連続失敗の通知~~ | ✅ **解消** (commit `<this PR>`): accounting-sync に `failureTracker` 統合 |
| ~~G8~~ | ~~Cloudflare Stream / Mux が `withRetry` 未経由~~ | ✅ **解消** (commit `<this PR>`): `cfsFetch` 内で 5xx/429 throw → `withRetry("cf-stream", ...)` 経由。4xx は permanent として Response 透過 |

### 4.3 P3 だが意思決定が必要

| # | 課題 | 必要な判断 |
|---|------|------|
| ~~G9~~ | ~~LINE 通知の握りつぶし方針~~ | ✅ **解消** (commit `be4b2e8`): `src/lib/line/clientWithRetry.ts` で重要通知 (作業完了 / 帳票 / 予約確認) を `withRetry` + 配信記録 + Twilio SMS フォールバック。案件詳細ページに「未配信」バッジ表示。時効性通知は fire-and-forget 維持 |
| ~~G10~~ | ~~Twilio SMS の用途と criticality~~ | ✅ **解消** (commit `313640a`): `sendOtpSms` / `sendNotificationSms` / `sendManualSms` の 3 用途で正式化。`withRetry("twilio", ...)` 経由、typed result |
| ~~G11~~ | ~~gBizINFO の retry / timeout~~ | ✅ **解消** (commit `089b03d`): `withRetry("gbizinfo", ...)` + 5s timeout |
| ~~G12~~ | ~~Slack lead 通知の retry~~ | ✅ **解消** (commit `089b03d`): 汎用 `notifySlack` を `withRetry("slack", ...)` 経由化、全 Slack 通知が一律恩恵 |

### 4.4 横断的 (運用面)

| # | 課題 | 提案 |
|---|------|------|
| ~~G13~~ | ~~webhook idempotency 一覧 (Square / LINE / Resend / CloudSign)~~ | ✅ **解消** (commit `<this PR>`): Square / LINE webhook に `claimWebhookEvent` 統合 (既存 Stripe / Resend と同じ `webhook_processed_events` テーブル経由)。Video は asset_id ベース update で実質 idempotent、CloudSign は未実装のため対象外 |
| ~~G14~~ | ~~`withRetry` 採用範囲の半自動チェック~~ | ✅ **解消** (commit `<this PR>`): `scripts/audit-withRetry.ts` で外部 SDK 呼び出し箇所を検査。`npm run audit:retry` (警告) / `audit:retry:strict` (CI 用 exit 1)。Stripe は Proxy で自動ラップなので対象外。**既知 baseline 25 件** (Resend 直接 fetch 等) は順次別 PR で `sendEmail` 経由に移行 |
| G15 | `/api/cron/monitor` 自身の死活 | 別 cron からの heartbeat 検証 (Better Uptime 等) |
| ~~G16~~ | ~~サービス別 timeout の明示~~ | ✅ **解消** (commit `<this PR>`): Stripe (30s) / Anthropic (60s) / Vercel AI route (60s) / Twilio (10s) / SendGrid (15s) / Slack (5s) / gBizINFO (5s) / Square (10-15s) は明示済。freee / MF は既存 `AbortController` で timeout 制御済 (`DEFAULT_TIMEOUT_MS`)。残: QStash publish (SDK 経由、明示なし、低優先) / Polygon viem (RPC 仕様で実質 30-60s) |

---

## 5. メンテナンスポリシー

- **新規サービス追加時**: §2 の表に 1 行、§3 の該当機能に 1 ブロック、§4 にギャップがあれば追記。
- **fail-mode 変更時**: PR description に「fail-mode を X から Y に変更」と明記。`docs/operations/external-dependency-matrix.md` の更新を含めること。
- **四半期レビュー**: `docs/internal/operations-runbook.md` §3 月次タスクに「外部依存マトリクスの timeout / criticality 見直し」を追加。

---

## 付録 A: 検証用コマンド

```bash
# Stripe SDK の直接 new Stripe(...) を検出 (共有 client 経由に統一されているはず)
rg "new Stripe\(" src/ --type ts | rg -v "src/lib/stripe/client.ts"
# → 0 件であること。1 件以上あれば getStripeClient() 経由に修正

# withRetry を経由していない外部 SDK 呼び出し候補 (Stripe は Proxy 経由で除外)
rg "resend\.|anthropic\.|twilio\.|squareClient\." \
  src/ --type ts -l | xargs -I {} sh -c \
  'grep -L "withRetry" {} || true'

# /api/cron/monitor が拾うべき外部サービスの env が揃っているか
grep -E "STRIPE_|RESEND_|ANTHROPIC_|QSTASH_|UPSTASH_|POLYGON_" .env.example | wc -l
```
