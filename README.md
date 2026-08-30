# Ledra

自動車整備 / ボディリペア / コーティング / PPF 店向けのマルチテナント SaaS。
施工証明書発行、請求・帳票、顧客ポータル、予約、保険会社 (損保) との案件連携、
部品装着インテグリティ (装着部品の真正性証明)、AI 業務自動化、
ブロックチェーン・アンカリング + RFC3161 タイムスタンプによる
証明書・装着記録の改ざん検知までを一本化して提供します。

```
Next.js 16.2 (App Router) + React 19.2 (React Compiler)
Supabase (Postgres + Storage + Auth) · Stripe · Upstash Redis + QStash
Sentry · Resend (+ SendGrid fallback) · Anthropic (Opus 4.8 / Sonnet 4.6 / Haiku 4.5)
@react-pdf/renderer · viem/ethers · RFC3161 TSA · Twilio · LINE · Healthchecks.io
```

## ディレクトリ概観

```
src/
├── app/                       Next.js App Router
│   ├── (marketing)/           公開 LP (SSG / ISR)
│   ├── admin/                 店舗オーナー (tenant 管理者) 画面
│   ├── agent/                 代理店 (Agent) 画面
│   ├── insurer/               損保ユーザー画面
│   ├── manufacturer/          メーカー (Manufacturer) 画面
│   ├── market/                中古車マーケット
│   ├── passport/              車両パスポート (vehicle passport)
│   ├── parts/                 部品装着インテグリティ (納車時の顧客確認 UI)
│   ├── customer/, c/, my/     顧客ポータル
│   ├── sign/, agent-sign/     電子署名フロー
│   └── api/                   635+ Route Handlers (38 トップレベルグループ)
│       ├── cron/              Vercel Cron (billing, follow-up, monitor, news, etc.)
│       ├── qstash/            非同期ジョブ (batch-pdf, polygon-backfill, 等)
│       ├── parts/             装着インジェスト / 監査 findings / 確定 / LINE 連携コード
│       ├── stripe/            webhook + portal
│       ├── v1/                外部公開 API (tenant API key 認証)
│       ├── line/              LINE bot webhook (予約リマインダー/顧客セルフ日程変更・キャンセル 等)
│       └── webhooks/          受信 webhook (Square / LINE / etc.)
├── lib/
│   ├── supabase/              service-role / ssr / mobile 用クライアント
│   ├── api/                   API 共通 (auth, rateLimit, response, safeJson)
│   ├── http/                  withRetry — 外向き呼び出しの retry + circuit breaker
│   ├── email/                 sendEmail (Resend → SendGrid フォールバック)
│   ├── ai/                    Anthropic structured outputs + withRetry ラップ
│   │   └── automation/        AI 自動化 orchestrator (写真改ざん検知 / 不正スコア 等)
│   ├── parts/                 部品装着インテグリティ (TSA / アンカー / 確定署名 / 照合)
│   ├── domain/                正準ドメイン状態語彙 (Job/Step/Severity/Certificate/Payment/Sync)
│   │                          — `states.ts` が単一定義源、`labels.ts` がロケール別 UI ラベル (ADR-0002)
│   ├── line/                  LINE bot 会話フロー (flow/ 状態機械 + 解釈)
│   ├── billing/               プラン / Stripe subscription ガード
│   ├── signature/             電子署名 + PDF 署名
│   ├── anchoring/             Polygon アンカリング
│   ├── cron/                  follow-up / failureTracker (連続失敗 + cooldown 通知)
│   ├── observability/         Sentry context + Healthchecks.io heartbeat
│   ├── security/              CSP header builder (nonce-based)
│   ├── customerPortal*.ts     マイページ認証 (OTP ベース)
│   ├── insurer/               insurer 向け共有ロジック
│   ├── logger.ts              structured JSON logger + correlationId
│   └── ...
├── components/                UI (admin / customer / marketing / ui)
├── content/                   MDX ブログ (marketing)
├── hooks/                     共通 React hooks
├── types/                     共有型 (Supabase 生成型を含む)
└── proxy.ts                   Next 16 proxy (旧 middleware)
                               ・x-request-id 採番 / 伝播
                               ・Origin/host チェックによる CSRF 防御
                               ・CSP nonce 発行 + header 付与
                               ・Supabase session リフレッシュ + 認証リダイレクト
                               ・rate limit プリセット適用

apps/
└── mobile/                    Expo (React Native) モバイルアプリ (ledra-mobile)
                               店舗スタッフ向け。証明書 / 車両 / 案件を現場で確認・操作。
```

## 主要機能の柱

- **施工証明書 × 改ざん検知**: 証明書を Polygon にアンカリングし、改ざん不能な
  真正性を担保。写真必須ガード (下記) と組み合わせ「証拠付きの証明書」を発行します。
- **作業完了サインオフ・ワークフロー (全業種共通)**: 「作業前後の傷で後から揉める」を
  潰すため、**完了報告 → 証明書発行 (施工前後写真ゲート) → お客様サイン (必須 / 不在時 24h
  リモート署名) → お会計 (顧客区分 × 支払いサイクルで自動判定) → オンチェーン** を 1 本の
  順序付きパイプラインとして案件画面 (`/admin/jobs/[id]`) に結線します。既存の受領サイン
  (`delivery_receipts`) を予約に結線し (`reservation_id`)、施工前 (入庫時) + 施工後の写真が
  両方揃うまでサイン依頼を出せない写真ゲートで Before/After を改ざん不能に固定。会計は
  法人×合算=スキップ (後日合算請求) / 法人×都度・個人×その場=会計 / 個人×事前決済=済 を
  自動判定します。順序ゲート・SLA・写真充足の判定は純関数
  `src/lib/signoff/state.ts` (`computeSignoffState`) に集約。
- **部品装着インテグリティ**: 装着部品の真正性を、装着インジェスト → AI 自動検査 →
  納品書 OCR との三方照合 → 確定署名 (OTP 所持証明 + 事業者署名 + RFC3161 TSA) →
  ブロックチェーン・アンカー → 納車時の顧客 LINE 確認、という一連で証明します。
  ロジックは `src/lib/parts/` (`installationService` / `reconcileService` /
  `confirmationService` / `partSigning` / `tsa` / `rfc3161` / `anchorService` /
  `metaAnchor`)、設計は `docs/parts-installation-integrity-design.md`、
  本番投入は `docs/parts-integrity-golive-checklist.md`。
- **AI 業務自動化**: `src/lib/ai/` に 40+ の structured-output タスク、
  `src/lib/ai/automation/` に信頼系 auto-action の orchestrator を実装。
  写真改ざん検知 (`photoTamperingAuto`) / 保険不正スコア (`fraudScoreAuto`) /
  膜厚異常 (`thicknessAuto`) などは `policy.ts` のガード下で自動実行されます。
  概説は `docs/ai-automation-guide.md`。
- **エンタープライズ多店舗 (本社 + 支店 / FC)**: 複数テナント (店舗) を「組織 (本社)」で
  束ね、本社チーム (`organization_users`, 複数ユーザ + 役割) が配下全店舗の顧客 / 車両 /
  作業履歴を **横断「閲覧」** できます (`/admin/hq-overview`)。書込は店舗単位の membership が
  必要で、本社以外は他店を変更できません (RLS ヘルパー `my_org_tenant_ids()`、
  閲覧は横断・書込は店舗単位)。店舗を持たない「本社専用ユーザ」もログイン可能です。
  基幹ソフト (車検・整備・販売管理) からは冪等 Push 取込 API
  (`POST /api/v1/ingest/{customers,vehicles,work-history}`、tenant API キー +
  `customers:write` 等のスコープ) で顧客 / 車両 / 作業履歴を吸い上げ、
  `(tenant_id, source_system, external_ref)` で重複なく upsert。逆方向は outbound webhook
  (`customer.created/updated` 等、取込 + 管理 UI 編集の両方で発火) で双方向同期します。
  連携管理 UI は `/admin/integrations`、設計は `docs/enterprise-multistore-foundation.md`。
- **LINE 顧客セルフサービス**: 予約前日リマインダー (キャンセル/変更ボタン付き) から、
  AI が受信メッセージの意図 (`intent=change_reservation` 等) を抽出して起動する
  会話フローで、顧客本人が LINE 上だけで日程変更・キャンセルを完結できます。
  対象は本人の予約 (`line_user_id` 紐付け) かつ前日までに限定し、当日・直前や
  空き候補なしはスタッフへ引き継ぎ。opt-in 設定 + Standard プラン以上 + AI 有効が前提。
  ロジックは `src/lib/line/flow/`・`src/lib/ai/automation/rescheduleFlowAuto.ts`、
  webhook は `src/app/api/line/webhook/`。
- **正準ドメイン状態語彙 (v2.0, ADR-0002)**: Job / Step / Severity / Certificate /
  Payment / Sync の 6 軸を独立した関心事として定義した単一の状態モデル。
  単一定義源は `src/lib/domain/states.ts`、ロケール別 UI ラベルは
  `src/lib/domain/labels.ts`。新しいステータス文字列・状態軸・遷移を追加する PR は、
  この正準モジュールと `src/lib/domain/__tests__/` を同一 PR で更新しない限り
  マージしません (詳細は本リポジトリの `CLAUDE.md`)。稼働中の既存語彙
  (`reservations.status` 等) との対応は IMP-015 で判断、対応表は
  `docs/implementation/requirement-trace.md` §1。

## セキュリティ上のお約束

1. **Service-role Supabase クライアントは `createTenantScopedAdmin(tenantId)` か
   `createInsurerScopedAdmin(insurerId)` 経由で使う**。`getSupabaseAdmin()` を直接
   import すると ESLint が警告します。RLS が全テナント分バイパスされるため、
   渡したスコープ ID でクエリを必ずフィルタしてください。
2. **`[id]` 動的 route では「ownership SELECT → 別 UPDATE」を書かない**。
   検証フィルタを UPDATE 側にもコピーしておくこと (TOCTOU / 将来リファクタ
   耐性)。`src/app/api/insurer/cases/[id]/route.ts` が reference 実装です。
3. **顧客ポータルの証明書取得はセッション email でも絞る**。末尾4桁ハッシュだけだと
   同一 tenant 内で 10000 分の 1 で衝突し、他顧客のデータが漏れ得る
   (`src/lib/customerPortalServer.ts` 参照)。
4. **Cron route (`/api/cron/*`) は必ず `verifyCronRequest(req)` を先頭で呼ぶ**。
   Vercel Cron signature (HMAC) と `Authorization: Bearer ${CRON_SECRET}` の両対応。
5. **Stripe webhook の冪等性**: `stripe_processed_events` テーブルへの claim が
   `23505` 以外で失敗したときは 503 を返す (Stripe が再送)。握り潰さない。
6. **施工証明書は写真必須 — `active` は必ず写真 1 枚以上を伴う**。証明書本体の
   作成と写真アップロードは別ステップ (新規は常に `draft` 作成 → 写真 upload →
   発行=活性化) なので、発行 (active 化) のサーバ側チョークポイント
   (`PUT /api/admin/certificates/status` / `POST /api/mobile/certificates/[id]/activate` /
   `POST /api/certificates/activate-by-key`) で `certificateHasRequiredPhotos`
   を必ず通す。新しい「active 化」経路を足すときも同じガードを入れること。
   ルール本体は `src/lib/certificates/photoRequirement.ts`、発行副作用は
   `src/lib/certificates/issueHooks.ts` (`triggerCertificateIssued`)。詳細は
   `docs/certificate-photo-requirement.md`。

## 運用・可観測性

- **Structured logging**: `import { logger } from "@/lib/logger"`。
  `.child({ requestId, tenantId })` で context を積み、`console.*` ではなく
  これを使ってください。JSON 一行なので Vercel Log Drain とそのまま嚙み合います。
  Secret キー (api_key / token / pepper / password / authorization 等) は
  自動マスクされます。
- **correlationId**: すべてのリクエストは `proxy.ts` で `x-request-id` が
  採番・伝播されます。レスポンスヘッダにも echo されるので、フロント
  からバックエンドまで同じ ID で追えます。
- **Sentry**: `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts`。
  `SENTRY_AUTH_TOKEN` が無いビルドでは source-map upload のみスキップします。
- **rate limit**: `src/lib/api/rateLimit.ts` のプリセット (`general` / `auth` /
  `webhook` / `mobile_*`) を `checkRateLimit(req, preset)` で使います。
  Upstash Redis 未設定時は in-memory fallback に切り替わります。
- **レスポンス JSON の握り潰し防止**: `safeJson(res, { fallback, context })` を
  使うと、JSON parse 失敗・非-JSON な 5xx を logger 経由で可視化しつつ
  fallback で継続できます (`src/lib/api/safeJson.ts`)。
- **外向き呼び出し**: Stripe / Resend / Polygon RPC / QStash / Square /
  Cloudflare Stream など外部 SDK・HTTP は必ず `withRetry("<key>", () => ...)`
  (`src/lib/http/withRetry.ts`) を通します。指数バックオフ + jitter + per-key
  circuit breaker で、ハードダウン時の event loop 暴走を止めます。
  Supabase Postgrest は pooler 側にリトライがあるため **wrap しない** こと。
  カバレッジは `npm run audit:retry` で検査できます。
- **メール送信の二系統化**: `sendEmail()` (`src/lib/email/sendEmail.ts`) は
  Resend を一次・SendGrid を二次にフォールバックします。Resend 直接 fetch
  は廃止済みなので、新規コードは必ず `sendEmail` 経由で。
- **Cron 死活監視**: `src/lib/cron/failureTracker.ts` が連続失敗 +
  cooldown ベースでアラート抑制し、`src/lib/observability/healthchecks.ts`
  が `/api/cron/monitor` 成功時に Healthchecks.io へ heartbeat を打ちます。
  Vercel Cron 自体が止まったケース (二重盲点) を Healthchecks 側で検知します。

## ローカル開発

```bash
# 初回
cp .env.example .env.local        # 必須変数を埋める
npm install

# 型チェック・テスト
npx tsc --noEmit                  # 0 error が前提 (noImplicitAny 有効)
npm run test                      # vitest (unit)
npm run test:e2e                  # Playwright

# 起動
npm run dev                       # http://localhost:3000
```

### 必須 ENV 変数 (抜粋)

| 変数 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase (公開) |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS バイパス用 (サーバのみ) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | 課金 |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | rate limit / cache |
| `QSTASH_CURRENT_SIGNING_KEY` / `_NEXT_SIGNING_KEY` | 非同期ジョブ |
| `CRON_SECRET` | Vercel Cron 認可 |
| `CUSTOMER_AUTH_PEPPER` | 顧客ポータル OTP / session hash |
| `RESEND_API_KEY` / `RESEND_FROM` | メール (一次) |
| `SENDGRID_API_KEY` / `SENDGRID_FROM` | メール (Resend 障害時の二次) |
| `TWILIO_ACCOUNT_SID` / `_AUTH_TOKEN` / `_PHONE_NUMBER` | SMS フォールバック (LINE 重要通知用, 任意) |
| `HEALTHCHECKS_MONITOR_PING_URL` | Cron 死活監視 heartbeat (任意) |
| `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | Sentry (任意) |
| `POLYGON_*` | ブロックチェーン・アンカリング (任意) |

詳細は `.env.example` を参照。Polygon anchoring の鍵セットアップは
`docs/metamask-signer-setup.md` に手順があります。

## テスト戦略

- **Unit (`vitest`)**: `src/**/__tests__/*.test.ts`・3800+ cases (400+ ファイル)。
  billing / stripe webhook / signature / anchoring / rate limit / withRetry /
  sendEmail / cron failureTracker / customer portal / logger / safeJson /
  parts integrity (TSA / 照合 / 確定署名) / AI automation policy / permissions など。
- **E2E (`Playwright`)**: `e2e/*.spec.ts`。signup / billing ガード /
  証明書フロー。カバレッジ拡張は `docs/AUDIT_REPORT_20260329.md` にロードマップ。
- **`audit:retry` script**: `npm run audit:retry` で外向き fetch / SDK 呼び出しの
  `withRetry` カバレッジを静的検査します。`--strict` で CI 失敗化。

## マイグレーション

Supabase 用の SQL は `supabase/migrations/` にタイムスタンプ順で入っています
(430+ 本)。追加時は以下を意識:

- **zero-downtime**: `ADD COLUMN NOT NULL DEFAULT` は避け、`ADD (nullable)`
  → `UPDATE` → `SET NOT NULL` の 3 段にする
- **tenant スコープ**: 新テーブルには `tenant_id uuid NOT NULL` を基本採用し、
  RLS policy を書く
- **index**: tenant_id を含む複合 index を作る (`(tenant_id, created_at DESC)` 等)
- **冪等性**: `CREATE POLICY` / `CREATE INDEX` / `CREATE TRIGGER` は
  `DROP IF EXISTS` 先行・`CREATE INDEX IF NOT EXISTS` などで再実行に耐える
  形にする。CI で `npm run lint:migrations` が走ります。

## 内部ドキュメント

- `docs/architecture-roadmap.md` — 中長期アーキ
- `docs/microservices-architecture.md` — 境界づけられたコンテキスト分解 / 進化的サービス抽出戦略
- `docs/operations-guide.md` — 運用手順 (監視 / インシデント対応)
- `docs/adr/` — アーキテクチャ決定記録 (正準ドメイン語彙・不変append-only証跡・証明書ゲート 等)
- `docs/parts-installation-integrity-design.md` — 部品装着インテグリティ設計
- `docs/parts-integrity-golive-checklist.md` — 部品装着インテグリティ Go-Live
- `docs/ai-automation-guide.md` — AI 自動化の概説 / ポリシー
- `docs/enterprise-multistore-foundation.md` — エンタープライズ多店舗基盤 (本社横断 RLS / 取込 API / 双方向 webhook / 本社専用ユーザ)
- `docs/implementation/requirement-trace.md` — 要件トレース (既存語彙 ⇔ 正準ドメイン語彙の対応表 等)
- `docs/stripe-production-checklist.md` — 本番 Stripe 切替
- `docs/polygon-anchoring-deployment.md` — Polygon 本番投入
- `docs/staging-environment.md` — staging 構成
- `docs/context/` — 事業ログ (現状 / 意思決定 / 未解決事項 / リリース履歴。運用ルールは `CLAUDE.md`)

## コントリビュート前のチェックリスト

- [ ] `npx tsc --noEmit` が 0 error
- [ ] `npm run test` が green
- [ ] `npm run lint` が clean
- [ ] migration を追加した場合 `npm run lint:migrations` が pass
- [ ] 外向き fetch / SDK 呼び出しを追加したら `withRetry` 経由 (`npm run audit:retry`)
- [ ] メール送信は `sendEmail()` 経由 (Resend 直叩きは禁止)
- [ ] 触った route / migration に tenant(or insurer) スコープが抜けていないか
- [ ] service-role クライアントを使うときは `createTenantScopedAdmin` 経由
- [ ] ユーザ入力を直接 DB に流していないか (`src/lib/validations/*.ts` で zod)
- [ ] ログに secret が載っていないか (`logger` なら自動マスク)
