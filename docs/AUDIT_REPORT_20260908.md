# Ledra セキュリティ監査レポート（2026-09-08）

**監査日**: 2026-09-08
**対象**: Ledra (Web: Next.js 16 App Router + Supabase + Stripe / モバイル: Expo Router)
**前回監査**: `docs/AUDIT_REPORT_20260604.md`（2026-06-04）からの差分・新規所見
**監査手法**: ソースコード静的解析（7 ドメイン並列レビュー: A 認可、B 未認証公開面、
C 秘密情報/暗号/AI露出、D モバイル、E 未完成/エラー要因、F 重複/拡張性、
G Supabase DB層）+ 本番 Supabase advisor 実測 + マイグレーション 448〜452 本を
空 DB に再生した実行検証（`psql` で grants・RLS policy・SECURITY DEFINER 関数
ガードの許可/拒否を直接確認）
**依頼範囲**: 前回監査は Web のみだったが、今回は**モバイルアプリ
（`apps/mobile`）を含む**全体監査。加えて「未完成部分」「重複コード圧縮」
「AI クローラからの保護」の3点をスコープに追加。

> 本監査は `docs/security-audit-framework.md` のフレームワークに従う。
> 今回から §4 のドメインチェックリストに加え、モバイル固有の観点
> （認証ガード・ディープリンク・端末ロック・決済のテナント検証）と、
> DB 層はコードレビューだけでなく**空 DB への実再生 + 実際の SQL 実行**で
> 検証する手法を導入した（過去監査は静的解析のみで、実行時の型不一致バグ
> 等を見落としていた。§9 参照）。

---

## 0. エグゼクティブサマリ

| 分野 | 前回 (06-04) | 今回 (09-08) | 変動 |
|------|-------------|-------------|------|
| 認可 / マルチテナント分離 | 8.0/10 | **6.5/10** | 新規 Critical 1件（組織横断閲覧）・High 2件 |
| 未認証・公開エンドポイント | — | **6.5/10** | OTP迂回・IP偽装・メール未確認ログイン等 High 3件 |
| 秘密情報 / 暗号 / AI露出 | 9.0/10 | **8.0/10** | ハードコード秘密なし・暗号良好。robots/noindex に抜け |
| Supabase DB 層（RLS/RPC） | 8.5/10 | **6.0/10** | 未検証RPC・過度に緩いRLS policy 多数。前回は静的解析のみで実行検証していなかった |
| モバイルアプリ | — | **5.5/10** | 新規ドメイン。レジ機能・OCR が動作不能、認証ガード欠如等 |
| 未完成/エラー要因 | — | **6.5/10** | 課金猶予ロジック不発火、決済Webhookの不整合処理等 |
| 重複/拡張性 | — | 情報提供のみ（スコア対象外） | route.ts 定型コード・未接続モジュール等 |
| **セキュリティ総合（認可+公開面+DB+モバイル）** | **8.2/10*** | **6.5/10** | **↓ 1.7**（*前回はWeb限定4ドメイン平均） |

**所見件数**: Critical 1 / High 11 / Medium 約35 / Low 約45。
**Critical: 1件（本監査で是正済み）**。前回 0 件からの悪化ではなく、
今回は認可ドメインを Web 全 648 route.ts + モバイル35ルートまで拡大した
ことで発見範囲が広がったことが主因（前回未走査だった組織管理機能・
代理店ポータル・モバイルPOSに集中）。

> 総合スコアの低下は「劣化」ではなく「監査範囲拡大による捕捉率向上」が
> 主因である。ただし Critical 1件・High 11件は実際にこの3ヶ月で本番に
> 存在していた欠陥であり、深刻度を過小評価すべきではない。

---

## 1. 認可 / マルチテナント分離 — 6.5/10

認証は前回同様 `supabase.auth.getUser()` で健全。認証欠落ルートは全 648
route.ts の機械走査で 0 件。以下、新規所見。

### CRITICAL-1: 組織メンバー追加における横断閲覧（是正済み）

- **場所**: `src/app/api/admin/organizations/[id]/members/route.ts:87-147`、
  `src/lib/api/orgStoreRead.ts:36-42`
- **内容**: 組織（多店舗グループ）への店舗追加 API が、呼び出し元が組織
  オーナーであることは検証するが、**追加対象テナント側の所属・承諾は
  一切検証していなかった**。組織作成は `requireMinRole(caller,"owner")`
  のみで誰でも到達でき（自テナントで signup すれば owner）、追加後は
  `createPlatformScopedAdmin`（RLS バイパス）経由で対象テナントの顧客
  （氏名・メール・電話・住所）・車両・作業履歴・当月売上を横断閲覧できた。
- **攻撃**: signup → 組織作成 → 任意テナント UUID を指定して店舗追加 →
  横断閲覧 API で顧客一覧取得。テナント UUID は B2B 受発注・保険会社/
  メーカー向け API・マーケット出品経由で入手可能。
- **是正（本セッション）**: 追加対象テナントの `tenant_memberships`
  （`role='owner'`）を要求するよう修正。DB 側 RLS policy にも同条件を追加
  （`supabase/migrations/20260908125138_org_members_require_target_owner.sql`）。
- **重大度**: **Critical**（未認証ではないが、自己登録だけで到達でき
  大規模な他テナント PII 横断閲覧に直結するため Critical 相当と判定）。

### HIGH-1: 代理店運営 API 14 ルートが任意テナント admin に開放（是正済み）

- **場所**: `src/app/api/admin/{agents,agent-applications,agent-contracts,
  agent-invoices,agent-notifications,agent-materials,agent-materials/
  upload-url,agent-campaigns,agent-shared-files,agent-support,
  agent-announcements,agent-faq,agent-training}/route.ts` + 14本の `[id]`
  ルート（`isPlatformAdmin` は要求済みだが `createTenantScopedAdmin` を
  使用）
- **内容**: `agents` はテナントを持たないプラットフォーム共通資源だが、
  一覧/作成系 14 ルートが `requireMinRole(caller,"admin")`（自テナント
  admin なら誰でも通る）のみで守られていた。代理店申請者の PII、報酬
  キャンペーン作成、任意メールへの契約署名依頼送信、署名済み PDF 取得が
  任意テナント admin から可能だった。`stepUpGuard.ts` の AAL2 必須
  prefix も末尾スラッシュの有無で `/api/admin/agents`（GET 一覧）を
  取りこぼしていた。
- **是正**: 28 ファイル全て `isPlatformAdmin(caller)` + `createPlatformScopedAdmin`
  に統一。`stepUpGuard.ts` の prefix 修正。`apiRoutePermissions.test.ts` に
  この 28 ファイルを機械走査して `isPlatformAdmin` 使用を強制する構造テストを追加。
- **重大度**: **High**（認証済みだが横断的な PII・重要操作への到達）

### HIGH-2: メンバー削除で owner を降格・削除できた（是正済み）

- **場所**: `src/app/api/admin/members/route.ts:268-300`（DELETE）
- **内容**: PUT（ロール変更）は owner 降格を拒否するが、DELETE は対象
  ロールを見ずに削除しており、admin ロールの内部者が owner を排除できた。
- **是正**: DELETE でも対象ロールを取得し owner を拒否。

### MEDIUM/LOW（抜粋）

- 複数テナント所属ユーザで「先頭の membership」を使う経路 3 箇所（active
  tenant cookie 無視）— PR-2 以降で是正予定。
- `admin/platform/ai-usage` のみ `isPlatformAdmin` ガード欠如（自テナント
  絞り込みのため実害小）。
- モバイル `registers/[id]/open` の `register_id` 所属未検証（推定）。

### 良好点

前回是正（HIGH-1 ai-draft、insurer/vehicles IDOR）は維持。外部 v1/passport
API キーは pepper 付き sha256 + scope/revoke/expiry。受発注は当事者検証。
証明書作成は `createCertificate` に一本化。

---

## 2. 未認証・公開エンドポイント — 6.5/10

route.ts 136 本 + 公開ページ 20 本を精読。

### HIGH-3: 保険会社登録 OTP の迂回（是正済み）

- **場所**: `src/app/api/join/send-code/route.ts:102-107`、
  `src/app/api/join/route.ts:58-70`
- **内容**: メール確認コード送信 API の「旧コード無効化」処理が
  `verified: true` を誤用しており、送信 API を 2 回叩くだけで一度も
  コードを入力せずに「確認済み」状態を作れた。
- **是正**: 無効化を `expires_at = now()` に変更。join 側は
  `verified=true and expires_at > now()` を要求。同型の非定数時間比較
  （前回 LOW-2 と同じ形の再発）も `timingSafeEqual` に修正。
- **重大度**: **High**（メール所有確認を全く経ずに保険会社アカウントを作成可能）

### HIGH-4: IP レート制限の迂回（是正済み）

- **場所**: `src/lib/rateLimit.ts:168-175`（`getClientIp`）
- **内容**: `cf-connecting-ip` 等クライアントが自由に設定できるヘッダを
  最優先で信頼していた。本番は Vercel 直配信（Cloudflare は動画配信のみ）
  のため、リクエスト毎に値を変えるだけで OTP発行・PDF生成・Stripe
  Checkoutセッション作成等の IP 単位レート制限を全て迂回できた。
- **是正**: `x-forwarded-for` の先頭（Vercel が上書き）を最優先に変更。
  CF ヘッダは `TRUST_CF_HEADERS=1` の明示 opt-in 時のみ信頼。
- **重大度**: **High**（多数の防御機構の実効性を無力化する横断的な穴）

### HIGH-5: `/api/signup` のメール未確認ログイン（是正済み）

- **場所**: `src/app/api/signup/route.ts:48-53`
- **内容**: パスワード登録が `email_confirm: true` でユーザーを作成し、
  直後にクライアントが `signInWithPassword` で即ログインしていた。
  メールの所有確認を一切経由せず、被害者のメールアドレスでテナント
  （owner）を作成できた。
- **是正**: `email_confirm: false` + 確認メール送信（既存 passwordless
  経路の `signInWithOtp` を流用）に統一。Web・モバイル共通のバックエンド
  のため両方に適用。
- **注意点**: モバイルは Apple Tap to Pay 要件（完全アプリ内オンボー
  ディング）との緊張関係が生じたため `docs/context/OPEN_QUESTIONS.md`
  （2026-09-08）に起票、製品判断待ち。暫定対応としてアプリは「確認メール
  送信済み」画面を表示するよう変更済み。
- **重大度**: **High**

### MEDIUM/LOW（抜粋・一部是正済み）

- レート制限の fail-open（Redis 未設定/障害時）— PR-2 で是正予定。
- 公開証明書メディア API が `active` 以外の状態でもメディア URL を返却
  — **是正済み**（`active` 限定 + `PUBLIC_ID_RE` 検証 + rate limit 追加）。
- join/signup のメール登録有無 409 応答（列挙オラクル）— PR-2 で是正予定。
- `qstash/test-publish` の秘密比較が非定数時間 — **是正済み**
  （`verifyCronRequest` に統一）。

### 良好点

Webhook 8 経路（Stripe/Connect/Resend/Square/CF Stream/Supply/LINE/
QStash/Edge）全て署名検証後にパース・冪等化。SSRF allowlist
（`urlAllowlist.ts`）健在。cron 35 ルート全件 `verifyCronRequest` 認証、
`vercel.json` の cron 定義と 1 対 1 対応。公開証明書/受領書ページの
PII 除外（前回是正）は維持。

---

## 3. 秘密情報 / 暗号 / AI 露出 — 8.0/10

追跡 4,304 ファイル・106 コミット全件走査。

### 結論

- **ハードコード秘密: 検出 0 件**（実値。テスト用ダミーと `.env.example`
  のプレースホルダのみ。コミット履歴 106 本の `-S` 検索でも同様）。
- **クライアントバンドルへのサーバ秘密流出: 0 件**（`"use client"` 476
  ファイルからのサーバ専用 env 参照なし）。
- **暗号強度: 良好**。`secretBox.ts` は AES-256-GCM + 12B ランダム IV。
  API キー・顧客セッション・OTP は sha256/HMAC + pepper でハッシュ保存、
  `randomBytes/randomInt` 生成。秘密比較の `timingSafeEqual` は本監査の
  是正で計 3 箇所に拡大（join/verify-code、qstash/test-publish に加え
  従来の 9 箇所）。

### MEDIUM-1: robots.txt の disallow 網羅漏れ + noindex 未設定ページ多数（依頼スコープ「AI クローラ保護」— 一部是正済み）

- **内容**: `src/app/robots.ts` はマーケティング領域で GPTBot/ClaudeBot
  等を明示 allow（意図的、GEO 目的）している一方、`/agent`(23ページ)・
  `/manufacturer`(8)・`/my`(4)・`/c/[public_id]`（公開証明書）等が
  disallow に含まれず、かつページ側 `robots: { index: false }` も
  無かった。`/agent`/`manufacturer` の未ログイン保護は Client
  Component 依存のため、クローラは HTML シェルを取得可能。
- **決定事項**（ユーザー承認済み）: `/c/[public_id]` は索引させない。
  `probe` ページと `deploy_probe.txt` のみ削除、`admin-prototype`/
  `motion-demo`/`pitch`/`video`/remotion は残す。
- **是正**: PR-4 で実装予定（`src/app/layout.tsx` の既定 noindex 反転 +
  `/c/` 専用 layout での明示 noindex + proxy の `x-robots-tag` 拡張）。

### LOW（抜粋）

- `supabase/.temp/*`（project-ref・pooler-url）が追跡されていた —
  **是正済み**（`.gitignore` 追加 + `git rm --cached`）。
- ルート `.gitignore` に署名鍵パターン（`*.p8` 等）が無かった —
  **是正済み**。
- CSP の `connect-src`/`img-src` が `*.supabase.co` ワイルドカード、
  Sentry edge 設定に `beforeSend` 欠如 — PR-4 で是正予定。

### 良好点

`productionBrowserSourceMaps` 無効、Sentry sourcemap は CI のみ
アップロード。Slack Webhook URL は allowlist 済み。公開証明書ページは
`customer_name`/`customer_email` を型定義のみで描画しない設計。

---

## 4. Supabase DB 層（RLS / SECURITY DEFINER 関数） — 6.0/10

マイグレーション 448〜453 本を空 PostgreSQL 16 に**実際に再生**し、
`pg_policies`/`pg_proc` の最終状態を `psql` で直接確認。**前回監査は
静的解析のみで実行検証していなかったため、今回は型不一致で常に例外に
なっていた RPC（後述）を含め、静的解析だけでは見えない欠陥を複数発見した。**

集計: テーブル 256 / RLS 有効 255（本番は 256、`insurer_email_verifications`
のみ無効だったものを是正） / policy 総数 608 / SECURITY DEFINER 85 本
（`search_path` 未設定 0）。

### HIGH-6: `register_insurer_v2` の anon 実行（是正済み）

- **場所**: `supabase/migrations/20260325000000_insurer_onboarding_v2.sql`、
  `20260325100000_insurer_onboarding_v2_extras.sql`（2オーバーロード）
- **内容**: 保険会社自己登録 RPC が SECURITY DEFINER で `auth.users` に
  `email_confirmed_at=now()` で直接 INSERT する。過去の是正セッションで
  「anon から呼ばれる必要がある」と判断され意図的に revoke 対象から
  外されていたが、実際のアプリ経路（`src/app/api/join/route.ts`）は
  service_role 経由のみで、anon/authenticated からの直接呼び出しは
  コード上どこにも存在しなかった（grep で確認）。anon キーで直接
  `POST /rest/v1/rpc/register_insurer_v2` を叩けば OTP・レート制限・
  パスワードポリシーを全て迂回して確認済みアカウントを無制限作成できた。
- **是正**: `revoke ... from public, anon, authenticated; grant ... to
  service_role;`（`20260908130328_revoke_public_register_insurer_v2.sql`）。
- **重大度**: **High**

### MEDIUM 群（是正済み、詳細は各マイグレーションのコメント参照）

| # | 内容 | 是正マイグレーション |
|---|------|----------------------|
| M-1 | `dashboard_tenant_stats`/`agent_rankings` に呼び出し元検証なし。任意 authenticated が他テナント統計・全代理店の実名/手数料を取得可能 | `20260908131725_guard_unauthenticated_rpc_stats.sql` |
| M-2 | `platform_*` 統計5関数が authenticated から呼べ、事業指標が漏洩 | 同上（+ サービスロール互換のため `20260908140748` で追い修正） |
| M-3 | `market` ストレージの書込 policy が `auth.uid() IS NOT NULL` のみでテナント区別なし | `20260908132157_rls_hardening_market_news_vsm_insurer_otp.sql` |
| M-4 | `saved_news` の INSERT policy が `WITH CHECK (true)` で anon 挿入可 | 同上 |
| M-5 | `vehicle_size_master`（全テナント共有マスタ）を任意テナント owner/admin が書換可能 | 同上 |
| M-6 | 役割を見ない書込 policy 145本/70表（viewer が書ける）— `tenant_webhooks`/`tenant_api_keys` 等 5 表を優先是正対象として特定 | PR-2 で是正予定 |
| M-7 | `insurer_email_verifications` の RLS が未有効化（256表中唯一） | 同上（`20260908132157`） |
| M-8 | 本番 `audit_logs` が policy 0本（advisor実測）で、モバイルAPIが利用者JWTで書込 → 監査ログが黙って落ちている疑い | 推定。PR-2 で `logTenantAuditEvent` の admin クライアント化を予定 |

**副次的発見**: `agent_rankings` の是正作業中、`agent_commissions.period_start`
（date型）と `v_start::text`（text型）を比較する既存コードが**型不一致で
常に例外になっていた**ことを実行検証で発見・修正した。この RPC は静的解析
だけでは「悪用可能」と判定されていたが、実際には一度も正常動作していな
かった（§9 参照）。

### コードレビューで発見・修正した回帰（本セッション内）

`is_super_admin_user()` ガードを追加した際、公開マーケティングページ
（`src/lib/marketing/network.ts`）が service_role で `platform_regional_stats`
を呼んでいることを見落とし、`auth.uid()` が NULL のため常に forbidden に
なる回帰を作った。`/code-review` で指摘を受け `auth.role() = 'service_role'`
を許可条件に追加。検証中に `coalesce()` を付けないと NULL 混入で
**fail-open**（ガードが素通り）するバグにも自ら気づき修正した
（`docs/context/MISTAKE_LEDGER.md` M-060）。

### LOW（抜粋）

- SECURITY DEFINER 4本の `search_path = public, extensions, pg_temp`
  （非空）— PR-2 以降で `''` へ強化予定。
- `insurer_search_*` の `p_limit`/`p_offset` 無制限。
- 監査ツールの盲点: `lint-migrations.js` に `with check (true)`/`grant
  to anon` の検出ルールが無く、`replay-migrations.mjs` は本番固有
  ポリシー（棚卸し済み68個）との diff をしない。週次 advisor ジョブへの
  `pg_policies` diff 追加を提案（未実装）。

### 良好点

JWT クレーム依存 0（`auth.jwt()`/`user_metadata` 参照は policy・関数
問わず 0 件）。`tenant_memberships` 昇格防止（owner 限定 + トリガ）。
`tenant_private_secrets` FORCE RLS。Realtime publication に機微テーブル
なし。SECURITY DEFINER 85 本すべて `search_path` 設定済み。

---

## 5. モバイルアプリ — 5.5/10（新規ドメイン）

`apps/mobile` 176 ファイル中 156 本を全文精読 + サーバ側 `/api/mobile`
35 ルート。前回監査は Web のみでモバイルは対象外だった。

### HIGH-7: レジ開け/締め機能が動作しない（是正済み）

- **場所**: `apps/mobile/src/app/pos/register.tsx:71,96`
- **内容**: `stores.id` を `registers.id` として API に渡しており、
  サーバ側の INSERT が FK 違反で必ず 500 になる。**レジ機能がそもそも
  動作しない状態で本番に存在していた。**
- **是正**: `register_sessions` 読取時に取得済みの `registers.id` を使うよう修正。

### HIGH-8: 車検証 OCR が常に 401（是正済み）

- **場所**: `apps/mobile/src/app/vehicles/new.tsx:157-168`
- **内容**: cookie 認証のみの `/api/vehicles/parse-shakken` を Bearer
  トークンで呼んでおり、モバイルからは一度も成功しない。
- **是正**: `/api/mobile/vehicles/parse-shakken` を新設し `resolveMobileCaller`
  で認証。

### MEDIUM（抜粋・一部是正済み）

- 認証ガードが `(tabs)/_layout.tsx` のみでディープリンク経由の未ログイン
  到達が可能 — PR-3 で是正予定。
- アプリロックが生体認証2回失敗で無認証解除可能 — PR-3 で是正予定。
- POS の PaymentIntent テナント検証欠如（`terminalCapture.ts`）—
  **是正済み**（`metadata.tenant_id` 検証追加）。
- `qr-status` エンドポイントがクエリの `tenant_id` を信頼 —
  **是正済み**（`caller.tenantId` 固定）。
- 知識共有画面の `video_url` が任意スキームで `Linking.openURL` される
  — **是正済み**（サーバ/クライアント両方で https(s) 限定）。
- オフラインバナーが未実装の同期機能を約束 — PR-3 で是正予定。
- ホーム集計が DB に存在しないステータス文字列で判定（CLAUDE.md 語彙
  ルール違反）— PR-3 で是正予定。
- 「店舗なしで続行」が `store_id: ""` を直接 insert し必ず失敗 — PR-3 で是正予定。

### 良好点

SecureStore へのセッション保存、`mobileApi` の Bearer/401 集約、35 ルート
全件 `resolveMobileCaller`。決済は Stripe 実額を採用し PaymentIntent
単位で冪等。NFC はタグ内 URL を直接開かず DB 照合を経由。

---

## 6. 未完成 / エラー要因 — 6.5/10

### HIGH-9: 課金猶予ロジックが不発火（是正予定・PR-2）

- **場所**: `src/lib/billing/guard.ts:174-175`
- **内容**: `sub.current_period_end` を読むが、Stripe SDK v20+ では
  `Subscription` から `SubscriptionItem` に移動済み。同ファイル内の
  webhook はフォールバック実装済みだが guard 側は未対応で、支払停止
  テナントの公開 PDF が 14 日猶予を経ずに即ブロックされる。

### HIGH-10: ショップ注文 Webhook の失敗が握りつぶされ支払済み・注文pendingが永久固定（是正予定・PR-2）

- **場所**: `src/app/api/stripe/webhook/route.ts:619-622`
- **内容**: DB 更新失敗時に `break` し、直後に処理済みフラグが立つため
  再送されても補正されない。

### HIGH-11: 管理側予約の重複作成が未検知（是正予定・PR-2）

- **場所**: `src/app/api/admin/reservations/route.ts`
- **内容**: 顧客向け予約経路にはある重複チェックが管理側には存在しない。

### 未完成（9件のうち代表）

`src/lib/domain/certificateGate.ts` の発行ゲート10条件中、実効判定は
4条件のみ（仕様との乖離。`docs/context/OPEN_QUESTIONS.md` 2026-08-31
で既知）。SES フォールバックが未実装スタブ。動画アップロードの状態
復旧ジョブ欠落。詳細は本レポート起票時点のプラン（Git 履歴参照）。

### 良好点

Stripe webhook の冪等 claim + 失敗時 503、cron 35/35 認証。入力検証
271 ルート中 256 が Zod。

---

## 7. 重複 / 無駄 / 拡張性（情報提供・スコア対象外）

依頼スコープに基づき圧縮候補を洗い出した。効果の大きい順に:

1. route.ts の認証定型コード（推定4-5千行、600ハンドラ）→ `withCaller`
   ラッパの新設を提案（PR-5）。
2. `resolveCallerFull`（8箇所）が `resolveCallerWithRole` と重複 → 廃止提案。
3. importer 0 の `src/lib` モジュール 25 本（3,200行）→ IMP-* 先行実装分は
   OPEN_QUESTIONS で接続予定を確認、それ以外は削除候補。
4. レート制限 2 系統、CSV/メール送信のローカル再実装、フォーマッタ 18 件
   の重複 → 既存ヘルパへの統合を提案。
5. Web↔モバイルの型定義コピー（`pos-constants.ts` 等は diff 0、
   `statusMaps.ts` は乖離済み）→ 共有パッケージ化を提案。

詳細は PR-5 実装時に個別記載する。

---

## 8. 検証結果（PR-1 実装分）

- 全マイグレーション（453本）を空 DB に再生し、`psql` で以下を実測:
  - `register_insurer_v2` の grants から anon/authenticated が消えたこと
  - `dashboard_tenant_stats`/`agent_rankings`/`platform_*` の 4 パターン
    （正規呼び出し・非会員・service_role・JWT role クレーム欠落）の
    許可/拒否
  - market ストレージ policy による他テナントオブジェクトの読み書き拒否
  - `insurer_email_verifications` の `relrowsecurity = true`
- `npx tsc --noEmit`（Web/モバイル両方）: **0 errors**
- `npx vitest run`: **546 test files / 5517 tests 全通過**
- モバイル self-check: **19本全通過**
- `npm run lint` / `apps/mobile npm run lint`: **0 errors**（既存warningのみ）
- `npm run lint:migrations` / `npm run check:migrations`: **OK**

## 9. 監査手法そのものについての教訓

MISTAKE_LEDGER の「型A: 道具を検証しない」に該当する事象を本監査で
2件確認した。

1. 静的解析ベースの監査エージェントは `agent_rankings` RPC を「他代理店
   の実名・手数料を任意 authenticated に漏らす」と判定したが、実際には
   `period_start` の型不一致で**呼び出す度に必ず例外になっており、
   一度も正常動作していなかった**。是正実装時に再生 DB で実行して初めて
   判明した。**コードを読んで「悪用可能」と判断することと、実際に実行
   して確認することは別**であり、今回は後者を全ての DB 修正で徹底した
   ことで発見できた。
2. `platform_*` 関数への `is_super_admin_user()` ガード追加は、自分自身
   のコードレビューでは検出できず `/code-review` の指摘で発覚した
   （service_role 呼び出しの見落とし）。さらにその修正自体にも
   NULL 混入による fail-open のバグを作り、これは実行検証で自分で発見
   した（MISTAKE_LEDGER M-060）。**セキュリティガードの追加・修正は、
   それ自体が新たな検証対象になる**。

---

## 10. 是正ロードマップ

【2026-09-09 更新】計画当初は PR-1〜PR-5 を5本の別PRに分ける想定だったが、
実際には PR #1054 の1本に全段階が積み重なった状態で実装・レビュー・修正が
進み、2026-09-09 に代表がこの1本を main へマージした。5段階すべてが
このマージで完結している。

| PR | 範囲 | 状態 |
|----|------|------|
| PR-1 | Critical/High セキュリティ修正（Web + DB） | **完了・mainマージ済み**（PR #1054） |
| PR-2 | 課金・予約・cron の整合性（High/Medium バグ） | **完了・mainマージ済み**（PR #1054） |
| PR-3 | モバイル修正（Medium/Low） | **完了・mainマージ済み**（PR #1054） |
| PR-4 | AI/クローラ露出と衛生 | **完了・mainマージ済み**（PR #1054） |
| PR-5 | 重複圧縮 | **完了・mainマージ済み**（PR #1054） |

各段階の実装内容は `docs/context/RELEASE_LOG.md` の2026-09-08〜09エントリ
（「セキュリティ監査是正 PR-1」〜「PR-5」、および2ラウンドのCodexレビュー対応）
を参照。マージ後もCodexレビューで見つかった1件（モバイルsignupのPKCE Cookie
衝突）のみ、Apple Tap to Payのアプリ内オンボーディング要件との緊張関係により
未修正・`docs/context/OPEN_QUESTIONS.md`にfounder判断待ちとして起票済み。

---

*本レポートは 2026-09-08 時点のコードベース静的解析 + 実行検証に基づく。
動的テスト・ペネトレーションテスト・負荷試験は別途推奨。重大度は到達
可能性（認証要否・RLS バイパス条件・実際に実行して動作するか）を加味
して補正済み。是正ロードマップの状況は2026-09-09にPR #1054のmainマージを
反映して更新した。*
