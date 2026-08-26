# Ledra 現状アーキテクチャ(IMP-000 監査ベースライン)

- 目的: `Ledra UI/UX & Development Specification v2.0` の実装(IMP-001 以降)に着手する前の、リポジトリ実査に基づく現状マップ。
- 監査日: 2026-08-19 / 対象コミット: `d2e4736`(branch `claude/imp-000-implementation-r0eje1`、main と同一内容)
- 記載原則: 本書の事実はすべてリポジトリ実査由来。件数は監査時に再計測し計測コマンドを併記する。リポジトリから確認できない事項(本番環境の設定値等)は `【要確認】` と記載し、推測で埋めない。
- 位置づけ: v2.0 要件との対応は [requirement-trace.md](./requirement-trace.md) を参照。本書は「何があるか」、trace は「何が足りないか」を扱う。

## 1. 技術スタック

`package.json`(name: `holy-cert`)より。

| 領域 | 採用技術 |
|---|---|
| フレームワーク | Next.js ^16.2.10(App Router, React Compiler 有効)+ React 19.2.7 + TypeScript 5.9.3(strict)+ Tailwind CSS 4(CSS-first、`tailwind.config` なし・`globals.css` の `@theme` が設定本体) |
| バックエンド | Supabase(Postgres + Storage + Auth、`@supabase/ssr`)。Edge Functions・seed.sql・config.toml は不使用 |
| 決済 | Stripe ^20.4.1(サブスク+Connect+Terminal/Tap to Pay)、Square(POS 連携) |
| 非同期/キャッシュ | Upstash QStash / Redis(レート制限・冪等性)、cron 32本(vercel.json) |
| 監視 | Sentry、Vercel Analytics/Speed Insights、PostHog、Healthchecks.io |
| メール/通知 | Resend(一次)→ SendGrid(フォールバック)、Twilio SMS、LINE Messaging API、Slack Incoming Webhook |
| AI | `@anthropic-ai/sdk`(structured outputs、月次コスト上限ブレーキ付き) |
| 真正性/暗号 | ethers + viem(Polygon)、AWS KMS、RFC3161 TSA、C2PA(`@contentauth/c2pa-node`、optional)、`@simplewebauthn/*`、`@openzeppelin/merkle-tree` |
| PDF/画像 | `@react-pdf/renderer`、sharp、qrcode、`@zxing/*`(バーコード)、exifr |
| バリデーション | zod ^4 |
| デプロイ | Vercel 東京リージョン(`hnd1`)。DB マイグレーションは GitHub Actions で本番自動適用(§10) |
| モバイル | `apps/mobile`: Expo SDK ~55 + React Native 0.83.6 + expo-router。独立 npm プロジェクト(ルート tsconfig から除外) |

## 2. サーフェス構成

### 2.1 ポータル(認証あり)

| サーフェス | ルート | ページ数 | 対象 |
|---|---|---|---|
| 店舗管理(本体) | `src/app/admin/` | 151 | 加盟店スタッフ。証明書/車両/顧客/予約/請求/POS/在庫/板金/ガント/監査/設定 等 |
| 代理店 | `src/app/agent/` | 27 | 報酬・紹介・研修 |
| 保険会社 | `src/app/insurer/` | 26 | 案件・監査・SLA・アンカー検証 |
| メーカー | `src/app/manufacturer/` | 8 | 認定テンプレ・品質 |
| 顧客 | `src/app/customer/[tenant]/` + `src/app/my/` | 7 | テナント別/横断マイページ(OTP+LINE) |
| マーケ | `src/app/(marketing)/` | 55 | 公開サイト |

計測: `find src/app -name page.tsx | wc -l` → **300**(監査日時点)。

### 2.2 公開ルート(認証なし)

`/c/[public_id]`(証明書公開ページ)、`/v/[vin]`(車両履歴・有料レポート)、`/sign/[token]`・`/sign/receipt/[token]`(電子署名/受領サイン)、`/track/[token]`(板金進捗)、`/parts/confirm/[token]`(部品装着確認)、`/intake/[short_id]`、`/join`、`/shop/[slug]`、`/market/[id]` ほか。

### 2.3 モバイルアプリ

`apps/mobile`(Expo)。タブ実値: **ホーム / 予約 / 作業 / 会計 / その他**(`apps/mobile/src/app/(tabs)/_layout.tsx`)。「その他」に顧客/車両/証明書/NFC/レジ/ダッシュボード/設定。Tap to Pay(Stripe Terminal)、NFC タグ、Expo Push(トークン登録まで)。状態管理は zustand + TanStack Query。デザイントークンは Web と非共有(`apps/mobile/src/constants/theme.ts`)。

## 3. ルーティング概況

- API Route Handlers: `find src/app/api -name route.ts | wc -l` → **627**。主な内訳: admin 334 / insurer 42 / agent 40 / cron 32 / mobile 26 / customer 13 / manufacturer 13 / v1(外部公開 API)7 / webhooks 6 / webauthn 6。
- **`middleware.ts` は存在しない**(リポジトリ全体を検索して確認)。エッジでの一括認証ゲートはなく、認可は各ページ(Server Component)と各 API ルートで個別に実施される(§4)。
- CSP は `src/proxy.ts` がリクエストごとに nonce 付きで設定(next.config.ts のコメントに明記)。その他のセキュリティヘッダは `next.config.ts` で網羅的に定義。

## 4. 認証・認可(3層)

### 4.1 認証

| 主体 | 方式 | 実装 |
|---|---|---|
| スタッフ(4ポータル共通) | メール+パスワード(`signInWithPassword`)+マジックリンク+SSO+MFA | `src/app/login/page.tsx` ほか各ポータル login、`src/lib/auth/{sso,ssoPolicy,mfa}.ts` |
| 顧客 | メール6桁 OTP(+電話下4桁)独自 cookie セッション、LINE ログイン | `src/lib/customerPortalServer.ts`(cookie `hc_cs`)、`customerPortalGlobal.ts`(`hc_cp`)、`customerPortalLineLogin.ts` |
| 重要操作 | WebAuthn パスキーによる**操作署名ゲート**(ログイン用生体認証ではない)。証明書 finalize/void/訂正の直前にチャレンジを原子的消費。モード off/optional/enforce | `src/lib/webauthn/gate.ts` の `requireOperationAssertion()` |
| モバイル端末 | 端末アテステーション(App Attest / Play Integrity)は写真真正性用 | `src/lib/anchoring/providers/` |

招待参加は `/join` + `/api/join/*`(メール検証コード)。v2.0 の正準フロー(Invite→言語→OTP→Store/Role→生体必須)は存在しない。

### 4.2 アプリ層認可

- caller 解決: `resolveCallerWithRole()`(`src/lib/auth/checkRole.ts`)→ `{userId, tenantId, role, planTier}`。API ルート 397 ファイルで使用(計測: `grep -rl resolveCallerWithRole src/app/api | wc -l` 相当)。
- ガード: `requireMinRole()` / `requirePermission()`(162 ファイル)。
- Role 5段: `super_admin/owner/admin/staff/viewer`(`src/lib/auth/roles.ts`、未知値は viewer に fail-closed)。
- Permission 約55種の `"resource:action"` union + `ROUTE_PERMISSIONS`(約48 エントリ)(`src/lib/auth/permissions.ts`)。
- 組織(本社)ロール別軸: `org_owner/org_admin/org_viewer` — 配下全店舗の**横断閲覧のみ**、書込は店舗 membership 必須(`src/lib/auth/orgRoles.ts`, `orgAccess.ts`)。
- プラン4段: `free/starter/standard/pro` + 機能マトリクス約30キー(`src/lib/billing/planFeatures.ts`)。設計方針は「UI は緩く、強制は API/402」(`src/lib/billing/guard.ts`)。
- アクティブテナント切替は `active_tenant_id` cookie。

### 4.3 DB 層(RLS)

- RLS 有効テーブル: `grep -hoi 'alter table [^ ]* enable row level security' supabase/migrations/*.sql | awk '{print $3}' | sort -u | wc -l` → **240**。
- ヘルパー(SECURITY DEFINER): `my_tenant_ids()`、`tenant_caller_has_role()`、`is_insurer_admin()` 等。標準ポリシー生成器 `_apply_standard_rls()`(SELECT=全メンバー / INSERT・UPDATE=owner,admin,staff / DELETE=owner,admin)。
- ESLint がアーキテクチャガードとして admin クライアントの直接 import を error で禁止し、`createTenantScopedAdmin(tenantId)` / `createInsurerScopedAdmin` / `createPlatformScopedAdmin` / `createServiceRoleAdmin(reason)` の使用を強制(`eslint.config.mjs`)。

## 5. データモデルとステータス語彙(実値)

### 5.1 マイグレーション運用

- `supabase/migrations/`: `ls supabase/migrations/*.sql | wc -l` → **414**(2026-03-12 〜 2026-08-16)。
- `supabase/migrations.allowlist`: 本番適用済みマイグレーションの凍結リスト。`npm run lint:migrations`(`scripts/lint-migrations.js`)が新規ファイルのみ危険パターン(ACCESS EXCLUSIVE ロック等)を検査。
- 適用: `.github/workflows/db-migrate.yml` が main への push で**本番 DB へ自動適用**(`supabase db push`、直列化、失敗は Slack 通知)。同ファイルに 2026-08-02〜08-15 の13日間ジョブ停止で証明書発行が止まった障害記録と不変条件(①適用済みバージョンのファイルは必ずリポジトリに置く ②新規は適用済み最新より後の日付)が明記されている。
- CREATE TYPE の enum は 0 件。**ステータスはすべて text + CHECK 制約**。

### 5.2 ステータス語彙(実値)

ラベル・バッジは `src/lib/statusMaps.ts` で一元管理。v2.0 正準語彙との対応は trace §1。

| 軸 | 実値 | 定義場所 |
|---|---|---|
| 予約(=案件) `reservations.status` | `confirmed / arrived / in_progress / completed / cancelled` | `supabase/migrations/20260315000002_reservations.sql` |
| 予約の支払 `reservations.payment_status` | `unpaid / paid / partial / refunded` | `20260402000000_workflow_engine.sql` |
| 作業ステップ `reservation_step_logs` | status 列なし。`started_at/completed_at` の有無で導出(未開始/作業中/完了) | 同上 |
| BtoB 発注 `job_orders.status` | `pending / accepted / in_progress / completed / rejected / cancelled` | `20260317000004_job_orders.sql` |
| 証明書 `certificates.status` | `active / void / draft / expired` | `20260313020000_core_tables.sql`+`src/types/certificate.ts`(SQL と TS 一致) |
| 支払 `payments.status` | `completed / refunded / partial_refund / voided` | `20260323040000_payments.sql`+`src/types/payment.ts`(一致) |
| 帳票 `DocumentStatus` | `draft / sent / accepted / paid / overdue / rejected / cancelled`(遷移マップ `nextStatusesFor()` あり) | `src/types/document.ts` |
| アンカー `certificate_anchors.status` | `queued / batched / anchored / failed` | `20260605000000_certificate_anchors.sql` |
| Outbox `outbox_events.status` | `pending / in_flight / delivered / errored / dead_letter` | `20260503000001_outbox_events.sql` |
| 写真真正性 `authenticity_grade` | `unverified / basic / verified / premium` | `20260411000000_c2pa_verification_schema.sql` |
| 部品装着 `part_installations.status` | `draft / installed / customer_verified / disputed / voided` | `20260714000001_part_installations_draft_status.sql` |

### 5.3 主要エンティティ群(約290テーブル)

- コア: `tenants` / `tenant_memberships` / `organizations`(本社) / `stores` / `customers` / `vehicles` / `certificates` / `certificate_images` / `reservations`(案件) / `documents`(帳票統合) / `payments` + `payment_entries`(売掛元帳)
- 真正性: `certificate_anchors`(+batches) / `photo_capture_nonces` / `part_installation_*` / `zkp_commitments` / `signature_*` / `nfc_tags`
- 運用: `audit_logs` / `admin_audit_logs` / `vehicle_histories` / `outbox_events` / `notifications` / `tenant_integrations` / `tenant_api_keys` / `cron_locks`

## 6. ドメインイベント・監査・冪等性

- **監査**: 汎用 `audit_logs`(old/new values、読み取り専用 RLS)、管理操作 `admin_audit_logs`(監査画面は Pro プラン)、業務イベント `vehicle_histories`+`logAuditEvent()`(`src/lib/audit/certificateLog.ts`、`AuditEventType` 27種: certificate_issued / reservation_completed / ai_suggestion_applied 等)。監査書き込み失敗は業務を止めない(console.error のみ)。
- **ドメインイベント**: `outbox_events`(topic+payload、部分インデックスで pending を毎分 `cron/outbox-flush` が配送)。外向き webhook は `tenant_webhooks`+`src/lib/outbound-webhooks.ts`。
- **冪等性(3系統)**: ① `withIdempotency()`(`src/lib/api/idempotency.ts`、Redis 24h、リクエスト指紋不一致は 409。**適用は API ルート2ファイルのみ**) ② `cert_idempotency_keys`(オフライン写真アップロードの public_id 逆引き、30日) ③ webhook 重複排除(`stripe_processed_events` UNIQUE、`webhook_processed_events`、`photo_capture_nonces` の単回消費、`cron_locks`)。
- cron 認証は `CRON_SECRET` の HMAC または Bearer(`src/lib/cronAuth.ts`)。

## 7. アンカリング・真正性

実装は `src/lib/anchoring/`。設計方針は「**既定 OFF・fail-open だが正直に degrade**」(TSA/C2PA 失敗時もアップロードは止めず `authenticity_grade` を下げる)。

| 層 | 内容 | 既定 |
|---|---|---|
| 画像バイト | SHA-256+知覚ハッシュ+EXIF 処理(GPS 除去)+単回撮影 nonce+RFC3161 TSA(`providers/photoTsa.ts`)+C2PA 署名(`providers/c2pa.ts`: disabled/dev-signed/production)+端末アテステーション+deepfake 判定 → `authenticity_grade` 4段 | env 未設定なら大半 OFF |
| 証明書メタ | canonical digest(PII 非含有を型で保証、`ledra-cert-v1`)→ `certificate_anchors` → Polygon instant または Merkle バッチ(cron `anchor-batch`/`polygon-signer`) | `CERT_RECORD_ANCHOR_ENABLED=false` |
| 部品装着 | 凍結ガード+OTP 署名+TSA+アンカー(cron `parts-anchor`) | — |

- 公開検証: `/api/cert-verify/[public_id]`(サーバ非依存で検証可能な材料を返す)、`/api/public/verify`(ハッシュ照合、PII 非返却)。
- C2PA は本番署名証明書が未取得(`docs/c2pa-production-deployment.md`: コードは実装・検証済み、残ブロッカーは証明書取得のみ)。
- 本番環境での各 env フラグの実際の ON/OFF は【要確認】(リポジトリからは確認不能)。
- 詳細は `docs/anchoring-roadmap.md` / `docs/certificate-photo-requirement.md` を参照。

## 8. オフライン対応の現状

- **Web(PWA)**: IndexedDB ベースの outbox キュー(`src/lib/outbox/queue.ts`、multipart/Blob 対応、Background Sync)+ Service Worker(`public/sw.js`)+読み取りキャッシュ(`src/lib/offline-cache/`)。配線済み: 案件ステータス変更・店頭ワークフロー・証明書画像アップロード等。証明書発行の完全オフライン化は設計済み・実装途上(`docs/pwa-offline-roadmap.md`, `docs/pwa-cert-offline-design.md`)。
- **モバイル**: オフライン検知バナー(`OfflineBanner`+NetInfo)のみ。**同期キューは未実装**(`docs/mobile-features.md` に計画のみ)。
- 競合(CONFLICT)検出・解決の仕組みはどちらにもない。

## 9. i18n の実態

- `next-intl` は依存にあるが実質未使用(import は `src/lib/i18n/messages.ts` のコメント参照のみ)。
- 実体は自前 `t()` ヘルパー(`src/lib/i18n/`)+ `messages/ja.json` / `en.json` — **中身は `errors.*` 8キーのみ**。
- 画面への適用はゼロ(admin・顧客ポータル・マーケすべて日本語ハードコード)。API 応答 i18n ヘルパー(`src/lib/api/responseI18n.ts`)は実使用 0 件。
- 現状の自己評価と残作業は `docs/i18n-status.md` に記録済み(「極めて部分的」)。

## 10. テスト・CI・デプロイ

- **ユニット**: Vitest。`find src -name '*.test.ts' -o -name '*.test.tsx' | wc -l` → **411**(+scripts 3、supabase 2)。厚い領域: `src/lib/ai`(36+automation 16)、validations 14、parts 14、certificates 10、anchoring 9+5。components は薄い(ui 10 ほか)。カバレッジ閾値(回帰検知フロア): statements 25 / branches 22 / functions 25 / lines 25。
- **E2E**: Playwright 15 spec(`e2e/`)。認可スモーク+シード付きフルフロー。**CI からは削除済み**(実 Supabase/Redis/Stripe 依存のため。`ci.yml` 内コメントに削除理由と復元位置の記録あり)。
- **CI**(`.github/workflows/`、14本): `ci.yml` = npm audit(high)+ lint / lint:migrations / `npx tsc --noEmit` / test:coverage の並列実行 + PR 限定 bundle-size(`SKIP_ENV_VALIDATION=true` でビルドし、非ゼロ終了でも `.next/build-manifest.json` の存在でコンパイル成否を判定、クライアントバンドル閾値 1200KB)。ほかに db-migrate(§5.1)、db-typegen(型自動 PR)、CodeQL(週次)、Lighthouse(マーケ変更 PR、a11y ≥0.9 は error)、mobile-ci(`apps/mobile` の typecheck+test)、supabase-advisors(週次)等。
- **ローカルフック**: pre-commit = lint-staged(prettier+eslint)、pre-push = `vitest --changed`(docs のみはスキップ)。
- **デプロイ**: Vercel(東京)。cron 32本は `vercel.json` で定義。root に `typecheck` script はなく、CI は `npx tsc --noEmit` を直接実行する。

## 11. 既知の技術的負債(監査時点)

1. `resolveCallerWithRole()`(`src/lib/auth/checkRole.ts`)と `resolveCallerFull()`(`src/lib/api/auth.ts`)がほぼ同一機能の二重実装。
2. `src/lib/validation/`(単数)と `src/lib/validations/`(複数)が併存。
3. `withIdempotency()` は実装済みだが適用が API ルート2ファイルのみ。
4. `src/app/admin/certificates/page.tsx` の `getMyTenantId()` が `active_tenant_id` cookie を無視して最初の membership を使う(RLS があるため越権にはならないが、複数テナント所属時に表示が不整合)。
5. `docs/dx-tooling.md` の CI ジョブマップが実態(E2E 削除済み、workflow 14本)より古い。
6. モバイルの `photoStage.ts` は Web からの手動複製(drift 注意コメントあり)。デザイントークンも Web と非共有。
7. `.npmrc` の `legacy-peer-deps=true`(`@zxing` の peer 競合回避、上流修正後に削除予定とコメントあり)。

## 12. ベースライン検証結果(IMP-000)

### 12.1 実行環境と制約

- 実行環境: このリポジトリのクローン(コミット `d2e4736`、作業ツリークリーン)。Node v22.22.2 / npm 10.9.7(CI と同じ Node 22 系)。実行日: 2026-08-19。
- 実 Supabase / Stripe / Upstash への接続なし。ビルドは CI と同じ `SKIP_ENV_VALIDATION=true` で実行し、`.next/build-manifest.json` の存在でコンパイル成否を判定する(CI `ci.yml` と同一基準)。

### 12.2 コマンド別結果

すべて無変更のリポジトリに対して実行(コミット `d2e4736`)。

| コマンド | 終了コード | 判定 | 所要時間 | 要点 |
|---|---|---|---|---|
| `npm ci` | 0 | PASS | — | 依存インストール成功 |
| `npm run lint` | 0 | PASS | 2m50s | 0 errors / 1218 warnings(`no-explicit-any` 等は設定で warn に格下げ済みの運用どおり) |
| `npm run lint:migrations` | 0 | PASS | 0.2s | allowlist 凍結+新規検査で違反なし |
| `npx tsc --noEmit` | 0 | PASS | 2m42s | 型エラーなし |
| `npm run test:coverage` | 0 | PASS | 2m26s | 全テスト成功。カバレッジ Statements 42.44% / Branches 38.71% / Functions 41.60% / Lines 42.96%(閾値 25/22/25/25 を充足) |
| `SKIP_ENV_VALIDATION=true npm run build` | 1(許容) | PASS(CI 基準) | 3m47s | `.next/build-manifest.json` 生成=クライアントコンパイル成功。非ゼロ終了は page-data collection での `supabaseUrl is required`(実シークレット欠如)によるもので、CI `ci.yml` が明示的に許容している同一パターン |
| `npm run check:bundle-size` | 0 | PASS | — | クライアントバンドル 762 / 1200 KB |
| `apps/mobile: npm run typecheck` | 0 | PASS | 10s | 型エラーなし |
| `apps/mobile: npm test` | 0 | PASS | 0.3s | `reservationSteps self-check: OK` |

**ベースライン結論**: 既存の検証はすべて green。以降のタスクで検証が赤になった場合、原因はそのタスクの変更にある。本 PR では失敗の修正・設定変更は一切行っていない。

### 12.3 実行しなかった検証と理由

- `npm run test:e2e`(Playwright 15 spec): 実行しない。実 Supabase・Upstash Redis・Stripe webhook 応答・デモシードに依存するため(この理由は `ci.yml` の E2E ジョブ削除コメントとしてリポジトリに実在する記録であり推測ではない)。
- 実 DB を要する検証(マイグレーション適用、`supabase-advisors`、デモシード投入): 本環境に実 DB がないため実行しない。
- 本番ビルドの完全成功(page-data collection まで): 実シークレットが必要で、CI 自体が要求していないため、ベースラインも同じ判定基準(build-manifest 存在)を採用。

## 13. 不可逆リスク台帳

後続タスク(IMP-001 以降)がコードを変更する前に必ず読むべき「触ると戻れない場所」。

| 領域 | リスク | 根拠/場所 |
|---|---|---|
| スキーマ移行 | main への push で**本番 DB に自動適用**される。`migrations.allowlist` 記載の適用済みファイルは書き換え禁止。新規は適用済み最新より後の日付必須。CHECK 制約は NOT VALID + VALIDATE で追加する運用 | `.github/workflows/db-migrate.yml`(障害記録付き)、`scripts/lint-migrations.js` |
| 証明書・証跡 | `certificate_images` のハッシュ・TSA・アンカーは発行済みデータの改ざん検知に使われており、既存行の変換・再エンコードは検証を壊す。部品装着は DB トリガで凍結 | `src/lib/anchoring/`、`20260603000001_part_installations_guard.sql` |
| 認証・RLS | RLS 240テーブル+標準ポリシー生成器。ポリシー変更は全テナントに即時波及。admin クライアントは ESLint 強制のスコープ付きファクトリ以外使用禁止 | `supabase/migrations/20260323020000_rls_role_constraints.sql`、`eslint.config.mjs` |
| 課金・決済 | Stripe webhook は冪等 claim(`stripe_processed_events`)前提。売掛元帳(`payment_entries`)は差額追記型で遡及修正不可。レポート収益還元は実送金(Stripe Connect)を伴う | `src/app/api/stripe/webhook/`、`src/lib/invoice/recordPayment.ts` |
| データ保持 | `cron/data-retention` が保持期限で実データを削除する。保持設定の変更は復元不能な削除につながる | `src/app/api/cron/data-retention/` |
| 顧客 PII | 保険会社への PII 開示は `is_pii_disclosed()` ゲート+アクセスログ(保持期間管理付き)。開示ロジック変更は法令・契約影響 | `supabase/migrations`(insurers 系)、`cleanup-insurer-logs` |
