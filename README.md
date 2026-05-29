# Ledra

自動車整備 / ボディリペア / コーティング / PPF 店向けのマルチテナント SaaS。
施工証明書の発行、請求・帳票、顧客ポータル、予約・案件ワークフロー、POS 会計、
BtoB 受発注、代理店 (Agent) / 損保 (Insurer) / メーカー (Manufacturer) 連携、
中古車マーケット、車両パスポート、AI 自動入力、ブロックチェーン・アンカリングによる
証明書改ざん検知までを一本化して提供します。

```
Next.js 16.2 (App Router) + React 19.2 (React Compiler) + Tailwind v4
Supabase (Postgres + Storage + Auth + Realtime) · Stripe · Upstash Redis + QStash
Sentry · Resend (+ SendGrid fallback) · Anthropic (Sonnet 4.6 / Haiku 4.5)
@react-pdf/renderer · viem/ethers · Square · Twilio · Healthchecks.io · next-intl (ja/en)
```

## 現状の規模

| 項目 | 規模 |
|---|---|
| API Route Handlers | **458** 本 (34 トップレベルグループ) |
| Supabase マイグレーション | **217** 本 |
| Unit テスト (vitest) | **1,855 cases / 161 ファイル** |
| ポータル | 5 系統 (Admin / Agent / Insurer / Manufacturer) + 顧客ビュー |
| `src/lib` ドメイン / 基盤モジュール | 67 ディレクトリ |
| AI 機能モジュール | 30+ (`src/lib/ai`) + automation policy engine |
| 対応言語 | 日本語 / 英語 (next-intl) |

Route 内訳 (上位): `admin` 226 · `insurer` 41 · `agent` 31 · `mobile` 23 ·
`cron` 21 · `manufacturer` 13 · `customer` 10 · `certificates` 10 ·
`signature` 8 · `stripe` 7 · `template-options` 7 …

> 画面単位の全機能・ワークフローは [`FEATURES.md`](./FEATURES.md) に網羅しています。
> 本 README は開発者向けのアーキテクチャ / 運用ガイドです。

## プロダクト構成

| ポータル | 対象 | 主な役割 | ルート |
|---|---|---|---|
| **Admin** (施工店) | 施工店スタッフ | 証明書発行・車両/顧客管理・請求・予約/案件・POS 会計・BtoB 受発注 | `/admin` (58 サブ領域) |
| **Agent** (代理店) | パートナー代理店 | 施工店紹介・コミッション・キャンペーン・研修・レポート | `/agent` |
| **Insurer** (損保) | 保険会社査定担当 | 証明書照会・案件管理・分析・AI サマリ/担当提案 | `/insurer` |
| **Manufacturer** (メーカー) | メーカー | 施工データ連携・パスポート照会 | `/manufacturer` |
| **Customer** (顧客) | エンドユーザー | 証明書閲覧・マイページ・電子署名 | `/c`, `/customer`, `/my`, `/sign` |
| **Market / Passport** | 公開 | 中古車マーケット・車両パスポート | `/market`, `/passport`, `/v` |

## ディレクトリ概観

```
src/
├── app/                       Next.js App Router
│   ├── (marketing)/           公開 LP (SSG / ISR) — features/* 個別 LP, blog, cases, news, pricing, 各種 contact
│   ├── admin/                 店舗オーナー (tenant 管理者) 画面 (58 サブ領域)
│   ├── agent/                 代理店 (Agent) 画面
│   ├── insurer/               損保ユーザー画面
│   ├── manufacturer/          メーカー (Manufacturer) 画面
│   ├── market/                中古車マーケット
│   ├── passport/, v/          車両パスポート (vehicle passport) + 公開照会
│   ├── customer/, c/, my/     顧客ポータル
│   ├── sign/, agent-sign/     電子署名フロー (受領 / 配送受領 / 代理店契約)
│   ├── intake/, join/         飛び込み受付 / 招待参加フロー
│   └── api/                   458 Route Handlers (34 トップレベルグループ)
│       ├── admin/             tenant 向け業務 API (226)
│       ├── insurer/, agent/, manufacturer/   各ポータル API
│       ├── mobile/            モバイルアプリ API (Apple Tap to Pay 含む)
│       ├── cron/              Vercel Cron (billing / follow-up / monitor / news / maintenance 等, 21)
│       ├── qstash/            非同期ジョブ (batch-pdf, polygon-backfill 等)
│       ├── stripe/            webhook + portal
│       ├── v1/                外部公開 API (tenant API key 認証)
│       └── webhooks/          受信 webhook (Square / LINE / etc.)
├── lib/
│   ├── ── ドメイン ──
│   │   certificate(s)/, certificateImages/, certificateMedia/   証明書発行・メディア
│   │   signature/             電子署名 + PDF 署名
│   │   anchoring/             Polygon アンカリング (証明書ハッシュの on-chain 記録)
│   │   imageMarkup/, bodyRepair/, ppf/, vehicleReport/          施工記録・塗膜厚・損傷図
│   │   reservations/, orders/, maintenance/, follow-up/          予約・受発注・整備・追客
│   │   invoice/, accounting/, pos/, pricing/, service-packages/  請求・会計・POS・価格
│   │   customers/, identity/, jpki/, ocr/                        顧客・本人確認 (マイナンバー/JPKI/OCR)
│   │   market/, marketplace/, accident-match/                    中古車マーケット・事故車マッチング
│   │   passport/              車両パスポート
│   │   billing/, stripe/      プラン / Stripe subscription ガード
│   │   line/, gcal/, sms/, video/, webhooks/                     外部連携 (LINE / Google Calendar / SMS / 動画)
│   │   stores/, whiteLabel/, theme/, features/, academy/         マルチ店舗・ホワイトラベル・権限・研修
│   │   ai/                    AI 自動入力基盤 (後述)
│   ├── ── 基盤 / 横断 ──
│   │   supabase/              service-role / ssr / mobile 用クライアント
│   │   api/                   API 共通 (auth, rateLimit, response, safeJson, parseJsonBody)
│   │   http/                  withRetry — 外向き呼び出しの retry + circuit breaker
│   │   email/                 sendEmail (Resend → SendGrid フォールバック)
│   │   cron/                  follow-up / failureTracker (連続失敗 + cooldown 通知)
│   │   observability/         Sentry context + Healthchecks.io heartbeat
│   │   security/              CSP header builder (nonce-based)
│   │   audit/                 監査ログ書き込み
│   │   crypto/, validation(s)/, csv/, documents/, i18n/          暗号 / zod / 帳票 / 国際化
│   │   logger.ts              structured JSON logger + correlationId
│   │   customerPortal*.ts     マイページ認証 (OTP ベース)
│   │   └── ...                (全 67 ディレクトリ。詳細は `ls src/lib`)
├── components/                UI (admin / customer / marketing / ai / pos / ui ほか)
├── content/                   MDX ブログ (marketing)
├── hooks/                     共通 React hooks
├── types/                     共有型 (Supabase 生成型 db.generated.ts を含む)
└── proxy.ts                   Next 16 proxy (旧 middleware)
                               ・x-request-id 採番 / 伝播
                               ・Origin/host チェックによる CSRF 防御
                               ・CSP nonce 発行 + header 付与
                               ・Supabase session リフレッシュ + 認証リダイレクト
                               ・rate limit プリセット適用
```

## AI 自動入力基盤 (`src/lib/ai`)

ワークフロー (証明書 / 案件 / 請求 / 顧客 / 保険 case / 在庫 / マーケット車両 など) に対し、
**フィールド単位**で「AI が自動入力 / AI が提案し人が承認 / 手動」を切り替えられる仕組みです。
詳細は [`docs/ai-automation-guide.md`](./docs/ai-automation-guide.md)、API 仕様は
[`docs/api/ai-endpoints.md`](./docs/api/ai-endpoints.md)。

- **共有クライアント** (`src/lib/ai/client.ts`): Anthropic SDK のシングルトン。SDK 内蔵 retry は
  無効化 (`maxRetries: 0`) し、`withRetry("anthropic", ...)` に委譲。モデルは
  `claude-sonnet-4-6` (既定 / Vision) と `claude-haiku-4-5` (高速・軽量タスク) を使い分け。
- **30+ の機能モジュール**: 証明書下書き / 説明文 (`draftCertificate`, `explainCertificate`)、
  写真品質・改ざんチェック (`photoQualityCheck`, `photoTamperingCheck`)、案件タイトル・次アクション
  (`jobAutoTitle`, `jobNextAction`)、請求書・見積生成 (`invoiceFromJob`, `quoteFromVehicle`)、
  問い合わせ分類 (`inquiryClassify`)、保険 case サマリ・担当提案 (`caseSummary`, `caseAssignSuggest`)、
  本人確認 OCR (`identityOcr`)、不正パターン検知 (`fraudPatternDetect`)、翻訳 (`translateContent`
  + `translationCache`) など。
- **ポリシーエンジン** (`src/lib/ai/automation/`): `fieldCatalog.ts` が対象フィールドの単一の真実。
  `policy.ts` が 3-way (auto / suggest / manual) を解決し、グローバルの master switch・
  `confidence_threshold` (低信頼な auto は suggest に降格)・`source_policies` を適用。設定 UI は
  `/admin/settings/ai-automation`。
- **admin AI ルートの共通ゲート順**:
  `checkRateLimit(req, "ai")` → `resolveCallerWithRole` → `canUseFeature(plan, key)` (不足は 403
  `plan_limit`) → zod 検証 → `loadAiAutomationSettings` (無効なら 200 `ai_disabled: true`) → AI 処理
  → `usage.record(...)` で `ai_usage_logs` に記録 + Sentry breadcrumb。
- **利用集計**: テナント別の利用状況は `/admin/platform/ai-usage` で確認できます。

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
6. **AI ルートは plan + AI 設定の二段ゲート**: `canUseFeature` でプラン制限、
   `loadAiAutomationSettings` でテナントの master switch / フィールド設定を尊重する。

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
  `webhook` / `ai` / `mobile_pos` / `mobile_terminal`) を `checkRateLimit(req, preset)`
  で使います。Upstash Redis 未設定時は in-memory fallback に切り替わります。
- **監査ログ**: 重要操作は `src/lib/audit` 経由で記録します (`/admin` の監査ログ画面で閲覧)。
- **レスポンス JSON の握り潰し防止**: `safeJson(res, { fallback, context })` を
  使うと、JSON parse 失敗・非-JSON な 5xx を logger 経由で可視化しつつ
  fallback で継続できます (`src/lib/api/safeJson.ts`)。
- **外向き呼び出し**: Stripe / Resend / Anthropic / Polygon RPC / QStash / Square /
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
npm run test                      # vitest (unit, 1,855 cases)
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
| `ANTHROPIC_API_KEY` | AI 自動入力 (`src/lib/ai`) |
| `RESEND_API_KEY` / `RESEND_FROM` | メール (一次) |
| `SENDGRID_API_KEY` / `SENDGRID_FROM` | メール (Resend 障害時の二次) |
| `TWILIO_ACCOUNT_SID` / `_AUTH_TOKEN` / `_PHONE_NUMBER` | SMS フォールバック (LINE 重要通知用, 任意) |
| `HEALTHCHECKS_MONITOR_PING_URL` | Cron 死活監視 heartbeat (任意) |
| `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | Sentry (任意) |
| `POLYGON_*` | ブロックチェーン・アンカリング (任意) |

詳細は `.env.example` を参照。Polygon anchoring の鍵セットアップは
`docs/metamask-signer-setup.md` に手順があります。

## テスト戦略

- **Unit (`vitest`)**: `src/**/__tests__/*.test.ts` — **1,855 cases / 161 ファイル**。
  billing / stripe webhook / signature / anchoring / rate limit / withRetry /
  sendEmail / cron failureTracker / customer portal / logger / safeJson /
  permissions / AI モジュール (automation policy・写真チェック・案件/請求/会計 等) を含む。
- **E2E (`Playwright`)**: `e2e/*.spec.ts`。signup / billing ガード /
  証明書フロー。カバレッジ拡張は `docs/AUDIT_REPORT_20260329.md` にロードマップ。
- **`audit:retry` script**: `npm run audit:retry` で外向き fetch / SDK 呼び出しの
  `withRetry` カバレッジを静的検査します。`--strict` で CI 失敗化。

## マイグレーション

Supabase 用の SQL は `supabase/migrations/` にタイムスタンプ順で入っています
(**217 本**)。追加時は以下を意識:

- **zero-downtime**: `ADD COLUMN NOT NULL DEFAULT` は避け、`ADD (nullable)`
  → `UPDATE` → `SET NOT NULL` の 3 段にする
- **tenant スコープ**: 新テーブルには `tenant_id uuid NOT NULL` を基本採用し、
  RLS policy を書く
- **index**: tenant_id を含む複合 index を作る (`(tenant_id, created_at DESC)` 等)
- **冪等性**: `CREATE POLICY` / `CREATE INDEX` / `CREATE TRIGGER` は
  `DROP IF EXISTS` 先行・`CREATE INDEX IF NOT EXISTS` などで再実行に耐える
  形にする。CI で `npm run lint:migrations` が走ります。

## 主要ドキュメント

- [`FEATURES.md`](./FEATURES.md) — **全機能一覧 & ワークフロー** (画面単位の網羅ドキュメント)
- `docs/ai-automation-guide.md` / `docs/api/ai-endpoints.md` — AI 自動入力基盤と API 仕様
- `docs/architecture-roadmap.md` — 中長期アーキ
- `docs/operations-guide.md` / `docs/internal/operations-runbook.md` — 運用手順 / インシデント対応
- `docs/slo.md` / `docs/disaster-recovery.md` / `docs/data-retention.md` — SLO / DR / データ保持
- `docs/stripe-production-checklist.md` — 本番 Stripe 切替
- `docs/polygon-anchoring-deployment.md` — Polygon 本番投入
- `docs/staging-environment.md` — staging 構成
- `docs/operations/zero-downtime-migrations.md` — ゼロダウンタイム migration 指針
- `docs/vehicle-passport-design.md` / `docs/mobile-features.md` — パスポート / モバイル設計

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
- [ ] AI ルートは plan (`canUseFeature`) と AI 設定 (`loadAiAutomationSettings`) を尊重しているか
- [ ] ログに secret が載っていないか (`logger` なら自動マスク)
