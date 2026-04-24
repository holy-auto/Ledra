# Ledra

自動車整備 / ボディリペア / コーティング / PPF 店向けのマルチテナント SaaS。
施工証明書発行、請求・帳票、顧客ポータル、予約、保険会社 (損保) との案件連携、
ブロックチェーン・アンカリングによる証明書改ざん検知までを一本化して提供します。

```
Next.js 16 (App Router) + React 19 (React Compiler)
Supabase (Postgres + Storage + Auth) · Stripe · Upstash Redis + QStash
Sentry · Resend · Anthropic · @react-pdf/renderer · viem/ethers
```

## ディレクトリ概観

```
src/
├── app/                       Next.js App Router
│   ├── (marketing)/           公開 LP (SSG / ISR)
│   ├── admin/                 店舗オーナー (tenant 管理者) 画面
│   ├── agent/                 代理店 (Agent) 画面
│   ├── insurer/               損保ユーザー画面
│   ├── market/                中古車マーケット (非公開)
│   ├── customer/, c/, my/     顧客ポータル
│   ├── sign/, agent-sign/     電子署名フロー
│   └── api/                   400+ Route Handlers
│       ├── cron/              Vercel Cron (billing, follow-up, news, etc.)
│       ├── qstash/            非同期ジョブ (batch-pdf, polygon-backfill, 等)
│       └── stripe/            webhook + portal
├── lib/
│   ├── supabase/              service-role / ssr / mobile 用クライアント
│   ├── api/                   API 共通 (auth, rateLimit, response, safeJson)
│   ├── billing/               プラン / Stripe subscription ガード
│   ├── signature/             電子署名 + PDF 署名
│   ├── anchoring/             Polygon アンカリング
│   ├── cron/                  follow-up 等の cron 実装
│   ├── customerPortal*.ts     マイページ認証 (OTP ベース)
│   ├── insurer/               insurer 向け共有ロジック
│   ├── logger.ts              structured JSON logger + correlationId
│   └── ...
├── components/                UI (admin / customer / marketing / ui)
├── content/                   MDX ブログ (marketing)
└── proxy.ts                   Next 16 proxy (旧 middleware)
                               ・x-request-id 採番 / 伝播
                               ・Origin/host チェックによる CSRF 防御
                               ・Supabase session リフレッシュ + 認証リダイレクト
```

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
| `RESEND_API_KEY` / `RESEND_FROM` | メール |
| `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | Sentry (任意) |
| `POLYGON_*` | ブロックチェーン・アンカリング (任意) |

詳細は `.env.example` を参照。Polygon anchoring の鍵セットアップは
`docs/metamask-signer-setup.md` に手順があります。

## テスト戦略

- **Unit (`vitest`)**: `src/**/__tests__/*.test.ts`・693+ cases。
  billing / stripe webhook / signature / anchoring / rate limit /
  customer portal / logger / safeJson / permissions など。
- **E2E (`Playwright`)**: `e2e/*.spec.ts`。signup / billing ガード /
  証明書フロー。カバレッジ拡張は `docs/AUDIT_REPORT_20260329.md` にロードマップ。

## マイグレーション

Supabase 用の SQL は `supabase/migrations/` にタイムスタンプ順で入っています
(130+ 本)。追加時は以下を意識:

- **zero-downtime**: `ADD COLUMN NOT NULL DEFAULT` は避け、`ADD (nullable)`
  → `UPDATE` → `SET NOT NULL` の 3 段にする
- **tenant スコープ**: 新テーブルには `tenant_id uuid NOT NULL` を基本採用し、
  RLS policy を書く
- **index**: tenant_id を含む複合 index を作る (`(tenant_id, created_at DESC)` 等)

## 内部ドキュメント

- `docs/architecture-roadmap.md` — 中長期アーキ
- `docs/operations-guide.md` — 運用手順 (監視 / インシデント対応)
- `docs/stripe-production-checklist.md` — 本番 Stripe 切替
- `docs/polygon-anchoring-deployment.md` — Polygon 本番投入
- `docs/staging-environment.md` — staging 構成

## コントリビュート前のチェックリスト

- [ ] `npx tsc --noEmit` が 0 error
- [ ] `npm run test` が green
- [ ] 触った route / migration に tenant(or insurer) スコープが抜けていないか
- [ ] service-role クライアントを使うときは `createTenantScopedAdmin` 経由
- [ ] ユーザ入力を直接 DB に流していないか (`src/lib/validations/*.ts` で zod)
- [ ] ログに secret が載っていないか (`logger` なら自動マスク)
