# Ledra セキュリティ監査レポート（2026-06-04）

**監査日**: 2026-06-04
**対象**: Ledra (CartTrust) プラットフォーム — Next.js 15 (App Router) + Supabase + Stripe
**前回監査**: `docs/AUDIT_REPORT_20260503.md`（2026-05-03）からの差分・新規所見
**監査手法**: ソースコード静的解析（5 ドメイン並列レビュー）+ 認可フロー手動追跡
**監査範囲**: 認可/マルチテナント分離・顧客認証/OTP・インジェクション/SSRF・
シークレット/Webhook/ロギング・RLS / DB ポリシー

> 本監査は `docs/security-audit-framework.md` で定義した監査フレームワークの
> 初回適用にあたる。今後の監査は同フレームワークのチェックリストと
> 重大度ルーブリックに従って継続実施する。

---

## 0. エグゼクティブサマリ

| 分野 | 前回 (05-03) | 今回 (06-04) | 変動 |
|------|-------------|-------------|------|
| 認可 / マルチテナント分離 | — | **8.0/10** | 新規ドメイン。基盤は堅牢、IDOR 1 件を是正 |
| 顧客認証 / OTP | — | **8.5/10** | pepper ハッシュ・CSPRNG・列挙耐性 確認。GDPR 系 rate limit 欠落のみ |
| インジェクション / SSRF | — | **7.0/10** | 認証付き SSRF 1 件・AI prompt injection 面 |
| シークレット / Webhook / ログ | — | **9.0/10** | 全 Webhook 署名検証・AES-256-GCM・ヘッダ堅牢 |
| RLS / DB ポリシー | — | **8.5/10** | tenant 分離良好。search_path 取りこぼし 3 件 |
| **セキュリティ総合** | **6.8/10** | **8.2/10** | **↑ 1.4** |

**所見件数**: 確認済み 8 件（High 2 / Medium 4 / Low 2）+ 検証済み「良好」コントロール 11 項目。
**Critical: 0 件。** 本監査セッションで High-1（クロステナント IDOR）を是正済み。

> サブエージェントの初期スコアリングでは「Critical」と分類された項目が複数あったが、
> 実際の到達可能性（認証要否・RLS バイパス条件・権限前提）を手動検証した結果、
> いずれも Critical には該当しないと再評価した（§4 重大度補正参照）。

---

## 1. 認可 / マルチテナント分離 — 8.0/10

アプリは `supabase.auth.getUser()`（JWT をサーバ側検証。`getSession` のような
クライアント詐称不可）で認証し、`resolveCallerWithRole()` / `resolveCallerFull()`
で `tenant_memberships` からテナント・ロールを解決する。サービスロール
（RLS バイパス）クライアントは `createTenantScopedAdmin(tenantId)` /
`createInsurerScopedAdmin(insurerId)` / `createPlatformScopedAdmin(reason)` の
明示ラッパ経由で取得し、各クエリに `tenant_id` フィルタを付ける契約になっている。
認証チェック自体の欠落ルートは検出されなかった（全 `/admin/**` `/insurer/**`
`/manufacturer/**` が caller 解決→未認証 401 を実装）。

### HIGH-1: クロステナント IDOR — `ai-draft`（**本セッションで是正済み**）

- **場所**: `src/app/api/admin/certificates/ai-draft/route.ts:76-93`
- **内容**: `createTenantScopedAdmin` から得た RLS バイパスクライアントで、
  `vehicles` / `hearings` を **`.eq("id", …)` のみ**でフェッチしていた
  （`tenant_id` フィルタ欠落）。テナント A の認証ユーザが他テナント B の
  `vehicle_id` / `hearing_id` を渡すと、B の車両情報（`vin`・`customer_name`・
  `customer_email`）とヒアリング内容（`customer_requests` 等）が AI 下書き
  レスポンスに混入し読み取れた。
- **重大度**: **High**（認証済みだが横断的に他テナントの個人情報を読める）
- **是正（本セッション）**: 両クエリに `.eq("tenant_id", caller.tenantId)` を追加。
  `vehicles` / `hearings` とも `tenant_id NOT NULL` を確認済み。
- **回帰防止（推奨）**: §1 MEDIUM-1 の systemic 対策を参照。

### MEDIUM-1: サービスロールクライアント利用時の明示 tenant フィルタ徹底（systemic）

- **内容**: `createTenantScopedAdmin` は **RLS をバイパスした生のサービスロール
  クライアント** を返すだけで、クエリのテナント絞り込みは開発者の責務。
  `.eq("id", x).single()` の形で **id だけで単一行を引く箇所が admin クライアント
  利用 33 ファイルに約 40 箇所** 存在する。大半は id が UUID かつ上流で検証済み
  だが、HIGH-1 のように `tenant_id` フィルタを欠くと即 IDOR になる構造的弱点。
- **重大度**: **Medium**（防御の深さ。各箇所は要個別検証）
- **推奨**:
  1. admin クライアント利用ルートでは **データクエリに必ず明示 `tenant_id`
     （または `insurer_id`）フィルタを付ける** コーディング規約を徹底。
  2. ESLint カスタムルール / `eslint-plugin-no-restricted-syntax` で
     「`createTenantScopedAdmin` の戻り `admin` に対する `.from().select()` で
     後続 chain に `tenant_id` が現れない」パターンを警告（ヒューリスティック）。
  3. 上記 40 箇所を棚卸しし、明示フィルタ追加 or 「id が大域一意で安全」コメント付与。
- **工数目安**: 棚卸し 1〜2 日 + ESLint ルール 半日。

### LOW-1: プラットフォームルートの `createTenantScopedAdmin` 利用（cosmetic）

- **場所**: `src/app/api/admin/platform/{tenants,operations,security-audit,
  tenant-addons,tenant-action}/route.ts` ほか
- **内容**: 横断照会用途なのに `createTenantScopedAdmin(caller.tenantId)` を使用。
  実害はない（これらのクエリは `tenant_id` フィルタを付けておらず、`isPlatformAdmin()`
  ガード下で意図通り全テナント横断で動作する）が、ラッパ名と用途が不一致で
  新規 contributor の誤読・誤用を招く。前回監査 MEDIUM-2 の継続項目。
- **重大度**: **Low**（コード衛生。機能・セキュリティ上の欠陥ではない）
- **推奨**: `createPlatformScopedAdmin("…")` への置換を完了し、ESLint で
  `/api/admin/platform/**` における tenant スコープラッパ使用を warning 化。

---

## 2. 顧客認証 / OTP — 8.5/10

顧客ポータルのパスワードレス OTP・セッション設計は堅牢。**良好と確認した点**:
pepper（`CUSTOMER_AUTH_PEPPER`）付きハッシュ保存、`crypto.randomInt`（CSPRNG）、
OTP TTL 5 分 / 最大 3 試行、request-code（IP 5/5min + アカウント 3/15min）・
verify-code（IP 10/5min + アカウント 8/15min）の二層レート制限、列挙耐性
（未知テナント/コードでも一律 200・エラー状態を `invalid_code` に集約）、
セッショントークン 32B（256bit）・`httpOnly`/`secure`(prod)/`sameSite=lax`・
TTL 30 日、セッション検証への `tenant_id` 同伴。

### MEDIUM-2: 顧客 GDPR/プライバシ系エンドポイントのレート制限欠落

- **場所**:
  - `src/app/api/customer/data-export/route.ts`（GET）
  - `src/app/api/customer/audit-log/route.ts`（GET）
  - `src/app/api/customer/data-deletion/route.ts`（POST/DELETE）
- **内容**: いずれも顧客セッション認証はあるが `checkRateLimit()` を呼んでいない。
  認証済みセッションを掌握した攻撃者がデータエクスポート/監査ログ/削除要求を
  無制限に連打でき、リソース枯渇・情報収集・削除フラッピングの余地。
- **重大度**: **Medium**（要認証だが DoS / 乱用面）
- **推奨**: 各ハンドラ冒頭に `const limited = await checkRateLimit(req, "sensitive");
  if (limited) return limited;` を追加（read 系は `"general"` でも可）。
- **工数目安**: 半日。

### LOW-2: OTP ハッシュ比較の定数時間化・コード長（情報提供レベル）

- **場所**: `src/app/api/customer/verify-code/route.ts:94`
- **内容**: 保存済み SHA-256 ハッシュの一致判定に `!==`（非定数時間）を使用。
  値は既にハッシュであり、レート制限下で実用的なタイミング攻撃は困難なため
  実リスクは低い。また OTP は 6 桁（約 20bit）だが、3 試行 + 二層レート制限で
  業界標準の水準。
- **重大度**: **Low**（衛生・任意強化）
- **推奨**: `crypto.timingSafeEqual()` 採用。必要に応じ 7〜8 桁化を検討。

---

## 3. インジェクション / SSRF / AI — 7.0/10

SQL インジェクションは検出されず（PostgREST + RPC はパラメータ化。
`insurer_search_certificates` 等の `EXECUTE` 動的 SQL は不在）。XSS も
`react-markdown`（既定で HTML エスケープ）利用で主要経路は安全。
`dangerouslySetInnerHTML` の濫用は確認されず。

### HIGH-2: 認証付き SSRF — `photo-tampering`（および Vision 画像 URL）

- **場所**: `src/app/api/admin/certificates/photo-tampering/route.ts:74-82`
- **内容**: JSON ボディの `photo_urls`（または `certificate_id` 経由で DB の
  `photo_urls`）をサーバ側 `fetch()` でダウンロードするが、**URL スキーム/ホストの
  allowlist 検証がない**。認証済みテナントユーザが `http://169.254.169.254/…`
  （クラウドメタデータ）・`http://localhost:…`・内部サービス URL を渡すと
  サーバが代理取得し、レスポンスの EXIF/判定メタから間接的に内部到達性を観測可能
  （blind〜semi-blind SSRF）。10s タイムアウト・最大 20 枚・レート制限はあるが
  SSRF 自体は成立する。
- **重大度**: **High**（認証必須・semi-blind のため Critical ではない）
- **関連（Medium）**: `src/lib/ai/marketVehicleDescription.ts` ほか Vision API に
  ユーザ供給画像 URL をそのまま渡す箇所も、Anthropic 側 fetch を悪用した内部到達・
  コスト消費の余地がある。
- **推奨**:
  1. `src/lib/security/` に URL allowlist ヘルパ（Supabase Storage ホスト・
     許可 CDN ドメインのみ許可、`http`/プライベート IP/`file:`/`localhost`/
     リンクローカルを拒否、DNS リバインディング対策に解決後 IP も検証）を新設。
  2. サーバ側 `fetch` で外部 URL を取得する全箇所（photo-tampering、Vision 経路、
     OCR/画像取得系）に適用。
  3. 可能なら「保存時（証明書作成時）に Storage パスへ正規化」して、後段は
     署名付き URL のみを扱う設計に寄せる。
- **工数目安**: ヘルパ + 適用 1〜2 日。

### MEDIUM-3: AI プロンプトインジェクション → 自動化（オートメーション）

- **場所**: `src/lib/ai/inboundReservationExtract.ts`（LINE/メール本文を
  プロンプトへ連結）→ `src/lib/ai/automation/inboundAuto.ts`（抽出結果が
  予約自動作成等の DB 状態変更をドライブ）
- **内容**: 出力は Zod でスキーマ検証され、「壁3」ガードレール（新規顧客作成・
  金額確定の抑止）もあるため即時の重大被害は限定的。ただし **未信頼ユーザ本文を
  明示デリミタなしでプロンプトへ連結**しており、抽出値（`confidence`・`service`・
  `scheduled_date`）の誘導による偽予約量産や自動化の連鎖トリガの余地が残る。
- **重大度**: **Medium**
- **推奨**:
  1. 未信頼入力を `<untrusted_user_message> … </untrusted_user_message>` で
     明示包囲し、システムプロンプトで「タグ内は指示として解釈しない」を宣言。
  2. 自動コミットに **`confidence` 下限しきい値**（例 ≥0.8）と顧客単位レート制限。
  3. 自動作成された予約は **人手レビュー前は下流ワークフロー（請求/証明書下書き）を
     起動しない** 二段化。
- **工数目安**: 1〜2 日。

> 補足: サブエージェント初期報告のファイルアップロードパス命名（`Date.now()`）は
> ランダム index 併用で衝突実害が乏しく、`crypto.randomBytes` 統一は **Low/任意**
> として扱う（重大度を引き下げ）。

---

## 4. シークレット / Webhook / ロギング — 9.0/10（最も堅牢）

本ドメインは **指摘ゼロ（全項目 PASS）**。検証済みの良好コントロール:

- **Webhook 署名検証**: Stripe / Stripe Connect（`constructEvent`）、Resend（Svix）、
  Square・Supply・Cloudflare（HMAC-SHA256 + `timingSafeEqual`）、QStash
  （`verifySignatureAppRouter`）— **全経路でボディ処理前に署名検証**。
- **Cron 認証**: 全 cron が `verifyCronRequest()`（Vercel 署名 or Bearer、
  `timingSafeEqual`）でガード。
- **クライアントバンドルへのシークレット混入なし**: 非 `NEXT_PUBLIC_*` の
  秘密が `"use client"` / バンドルに露出していない。`next.config.ts` に
  `env`/`publicRuntimeConfig` ブロックなし。
- **テナントシークレット暗号化**: `src/lib/crypto/tenantSecrets.ts` /
  `secretBox.ts` が **AES-256-GCM（Web Crypto、毎回ランダム 96bit IV、
  認証タグ同梱、`v1.<iv>.<ct+tag>` フォーマット）**。Square トークン・
  Supply Webhook secret・LINE channel secret を暗号化保存（平文カラムなし）。
- **セキュリティヘッダ**: `X-Frame-Options: DENY`、`nosniff`、HSTS 2 年 +
  `includeSubDomains`、`Referrer-Policy`、COOP/CORP/COEP、制限的
  `Permissions-Policy`。CSP は `proxy.ts` で nonce 付きリクエスト単位適用。
  過度に緩い CORS（`*`）なし。
- **Sentry PII スクラブ**: client/server とも `beforeSend` で `user.email` /
  `user.ip_address` を除去 + テナント/ドメインタグ付与。
- **API キー管理**: 外部 API キーは GET でマスク（末尾4桁）のみ、POST 応答で
  一度だけ平文返却。テナント API キーは pepper 付きハッシュ保存（不可逆）+
  scope/失効/期限。
- **シークレットローテーション台帳**: `.secrets-age.json` に rotated_at /
  ttl_days を管理（平文の値は非コミット）。`check:secrets-age` で TTL 監視。

> 改善余地（Low）: Sentry の例外コンテキストで Authorization ヘッダ・
> リクエストボディの送出有効化時はそれらも `beforeSend` で除去する。

---

## 5. RLS / DB ポリシー — 8.5/10

RLS のテナント分離は良好。**良好と確認した点**: 機微テーブル（customers /
certificates / vehicles / documents / reservations / job_orders）は RLS 有効 +
`my_tenant_ids()` / `my_tenant_role()` でテナント・ロール分離。
サービスロール専用テーブル（stripe_connect_transfers 等）は適切に限定。
公開証明書ビュー `certificates_public` は `20260531100001` で PII
（customer_name / content_free_text）をリダクト済み。`auth.jwt()` の
カスタムクレームを権限判定に使う詐称可能パターンは不在（ロール判定は
全て `tenant_memberships` 経由＝サーバ管理）。`USING (true)` の広域ポリシーは
いずれも公開リファレンスデータ（shop_products・vehicle_size_master・
standard_rules・signature_public_keys 等）で設計上許容。

### MEDIUM-4: `SECURITY DEFINER` 関数の `search_path` 取りこぼし 3 件

- **場所**:
  - `is_super_admin_user()` — `20260424010000_site_content_posts_super_admin_only.sql:22`
    （`SET search_path = public` + `tenant_memberships` 非修飾参照）
  - `increment_intake_ocr_attempts()` — `20260527000001_customer_intake_invitations.sql:102`
  - `apply_inventory_movement()` — `20260413000000_inventory_management.sql:105`
- **内容**: 既に `20260404000000_fix_security_definer_search_path.sql` で多数の
  関数を `SET search_path = ''` に統一済みだが、上記 3 件が **その標準から漏れて
  いる回帰**。`public` への object 作成権限が一般ロールに付与されていない限り
  即時悪用は困難で、Supabase advisor の `function_search_path_mutable`（warning）
  相当のハードニング項目。`is_super_admin_user` は super_admin 判定に使われるため
  確実に閉じるべき。
- **重大度**: **Medium**（ハードニング。前例どおり修正は容易・安全）
- **推奨**:
  1. 追補マイグレーションで該当 3 関数を `SET search_path = ''` 化 + テーブル参照を
     `public.` 修飾（`is_super_admin_user` は本文の `tenant_memberships` を
     `public.tenant_memberships` に）。
  2. `scripts/lint-migrations.js` に **「`SECURITY DEFINER` かつ
     `search_path = ''` 以外」を検出する lint** を追加し再発防止。
  3. 本番では `mcp Supabase get_advisors(type:"security")` を定期実行して
     advisor ベースラインを継続監視。

---

## 6. コンプライアンス・コントロールマッピング

`docs/iso27001-soc2-prep.md` の SoA と本監査所見の対応:

| 管理策 | ISO 27001 | SOC 2 | 本監査での状態 |
|--------|-----------|-------|----------------|
| アクセス制御（RBAC/テナント分離） | A.5.15 / A.8.3 | CC6.1-6.3 | ✓ 良好（IDOR 1 件是正、systemic 規約推奨） |
| 暗号化（保存/転送） | A.8.24 | CC6.1 | ✓ AES-256-GCM + TLS + HSTS |
| 認証（顧客/スタッフ） | A.5.17 / A.8.5 | CC6.1 | ✓ OTP/pepper/列挙耐性。GDPR系 rate limit 追加推奨 |
| ログ・監視 | A.8.15-8.16 | CC7.2 | ✓ Sentry PII scrub + audit_logs + cron alert |
| セキュアな開発 | A.8.25-8.28 | CC8.1 | ✓ CodeQL/Codacy/Sonar/npm audit。SSRF/IDOR lint 推奨 |
| サプライヤ/外部連携 | A.5.19-5.23 | CC9.2 | ✓ Webhook 署名検証・テナント secret 暗号化 |
| 脆弱性管理 | A.8.8 | CC7.1 | ✓ 本監査フレームワークで定期化 |
| データ保持/削除 | A.5.34 / A.8.10 | P/C シリーズ | ✓ `data-retention.md` + cron。export/deletion rate limit 推奨 |

---

## 7. 是正ロードマップ（優先度付き）

### 即時（本セッションで実施済み）
- ✅ **HIGH-1 クロステナント IDOR（ai-draft）** に `tenant_id` フィルタ追加。

### Tier 1 — 1〜2 週間（リスク削減）
1. **HIGH-2 SSRF allowlist ヘルパ**新設 + photo-tampering / Vision 経路へ適用 — 1〜2日
2. **MEDIUM-2 顧客 GDPR 系 rate limit**（export/audit-log/deletion）— 半日
3. **MEDIUM-4 search_path 追補マイグレーション** + migration lint — 半日
4. **MEDIUM-1 admin クライアント tenant フィルタ棚卸し**（40 箇所）+ ESLint ガード — 1〜2日

### Tier 2 — 3〜6 週間（強化）
5. **MEDIUM-3 AI prompt injection ハードニング**（untrusted 包囲 + confidence 閾値 + 自動化二段化）— 1〜2日
6. **LOW-1** `createPlatformScopedAdmin` 移行完了 + ESLint 誘導 — 半日
7. **LOW-2** OTP `timingSafeEqual` 化（任意でコード長拡張）— 半日
8. Supabase `get_advisors` を CI/定期に組込み、advisor ベースライン監視 — 半日

---

## 8. 結論

前回（05-03）以降、API レスポンス統一・Zod 検証・Sentry コンテキスト・
CodeQL 導入が効いており、**シークレット/Webhook/暗号化レイヤーは指摘ゼロ**の
高水準。残るリスクの中心は

1. **HIGH-1 クロステナント IDOR**（→ 本セッションで是正）
2. **HIGH-2 認証付き SSRF**（→ allowlist 化）
3. サービスロール利用時の **明示 tenant フィルタ徹底（systemic）**
4. AI 自動化のプロンプトインジェクション・ハードニング

の 4 点。Critical は存在しない。Tier 1（合計 ~3〜4 人日）の消化でセキュリティ
総合 9.0/10 圏に到達可能。継続的な再発防止は `docs/security-audit-framework.md`
のチェックリスト・lint ガード・advisor 監視で担保する。

---

*本レポートは 2026-06-04 時点のコードベース静的解析に基づく。動的テスト・
ペネトレーションテスト・負荷試験は別途推奨。重大度は到達可能性（認証要否・
RLS バイパス条件）を加味して補正済み。*
