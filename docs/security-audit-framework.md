# Ledra セキュリティ監査フレームワーク

Ledra プラットフォームの **定期セキュリティ監査** を再現可能・一貫した方法で
実施するための運用フレームワーク。監査スコープ・ドメイン別チェックリスト・
重大度ルーブリック・所見ライフサイクル・ツール・コンプライアンス対応を定義する。

- 最新の適用結果: `docs/AUDIT_REPORT_20260604.md`
- 過去レポート: `docs/AUDIT_REPORT_20260503.md`, `docs/AUDIT_REPORT_20260329.md`
- コンプライアンス前提: `docs/iso27001-soc2-prep.md`, `docs/data-retention.md`, `docs/dpa-template.md`

---

## 1. 目的とスコープ

| 項目 | 内容 |
|------|------|
| 目的 | 既知の脆弱性クラスを体系的に検出し、再発を構造的に防止する |
| 対象 | アプリ（Next.js App Router / API ルート / Server Actions）、Supabase（RLS / SQL 関数 / マイグレーション）、外部連携（Stripe / Square / QStash / Resend / Cloudflare / Polygon / LINE）、CI/CD・シークレット運用 |
| 対象外 | クラウドプロバイダ物理/インフラ（Supabase/Vercel の SOC2 に依拠）、ペネトレーションテスト（外部委託で別途）、負荷/DoS 試験 |
| 独立性 | 監査者は所見の重大度を**到達可能性ベース**で客観評価する。実装者と分離した視点を保つ |

---

## 2. 監査ケイデンス

| トリガ | 範囲 | 成果物 |
|--------|------|--------|
| 四半期定期 | 全 7 ドメイン（§4） | `docs/AUDIT_REPORT_YYYYMMDD.md` |
| 主要リリース前 | 変更差分 + 関連ドメイン | PR 内チェックリスト |
| 新規外部連携追加時 | §4-D, §4-F | 連携別レビュー |
| 継続（自動） | CodeQL / Codacy / Sonar / npm audit / Supabase advisors | CI ステータス + 週次レビュー |

---

## 3. 監査ワークフロー

1. **計画** — 前回レポートの残課題と差分を確認し、対象ドメインと範囲を確定。
2. **フィールドワーク** — §4 のドメイン別チェックリストを並列実行
   （ドメインごとに独立調査 → 所見を file:line で記録）。
3. **検証（重大度補正）** — 各所見の**到達可能性**を手動確認し §5 ルーブリックで
   重大度を確定。自動ツール/サブエージェントの初期スコアは過大評価しがちなため、
   認証要否・RLS バイパス条件・権限前提を必ず追跡して補正する。
4. **報告** — 重大度順に所見・良好コントロール・コンプライアンス対応・
   是正ロードマップ（Tier + 工数）を `docs/AUDIT_REPORT_YYYYMMDD.md` に記録。
5. **フォローアップ** — Tier 1 を次サイクルまでに是正、構造対策（lint/規約）で再発防止。

---

## 4. ドメイン別チェックリスト

### A. 認可 / マルチテナント分離
- [ ] 認証は `supabase.auth.getUser()`（サーバ側 JWT 検証）。`getSession` を権限判定に使わない
- [ ] 全保護ルートが `resolveCallerWithRole()` 等で caller 解決 → 未認証 401 / 権限不足 403
- [ ] ロール/権限は `tenant_memberships`（サーバ管理）で判定。**body/header 由来のロールを信用しない**
- [ ] サービスロール（RLS バイパス）は `createTenantScopedAdmin` / `createInsurerScopedAdmin` / `createPlatformScopedAdmin` ラッパ経由のみ
- [ ] **admin クライアントの全データクエリに明示 `tenant_id` / `insurer_id` フィルタ**（`.eq("id", x)` 単独で単一行を引かない）→ IDOR 防止
- [ ] プラットフォーム横断ルートは `createPlatformScopedAdmin` + `isPlatformAdmin()` ガード
- [ ] ページnetwork/レイアウトの Route Guard（insurer/manufacturer/admin）配置

### B. 顧客認証 / OTP / セッション
- [ ] OTP は CSPRNG（`crypto.randomInt`）生成、TTL・最大試行・ロックアウトあり
- [ ] OTP/トークンは pepper 付きハッシュで保存（平文不可）、比較は `timingSafeEqual`
- [ ] request-code / verify-code に IP + アカウントの二層レート制限
- [ ] 列挙耐性（未知の識別子でも一律応答、エラー状態を集約）
- [ ] セッショントークン ≥256bit、Cookie は `httpOnly`/`secure`(prod)/`sameSite`、TTL 妥当
- [ ] セッション検証に `tenant_id` 同伴（クロステナント不可）
- [ ] **PII/GDPR 系ルート（data-export / audit-log / data-deletion）にも rate limit**
- [ ] トークンルート（agent-sign 等）は十分なエントロピー・単回利用・期限・定数時間比較

### C. インジェクション / SSRF / XSS / AI
- [ ] SQL は PostgREST/パラメータ化 RPC のみ。`EXECUTE` 動的 SQL に未信頼入力を渡さない
- [ ] **サーバ側 `fetch` の URL は allowlist 検証**（スキーム/ホスト、プライベート IP・
      `localhost`・リンクローカル・`file:` を拒否、解決後 IP も検証＝DNS リバインディング対策）
- [ ] Vision/AI に渡す画像 URL も allowlist or 署名付き Storage URL のみ
- [ ] ファイルアップロードは content-type/サイズ/拡張子検証、パスはテナント scope + ランダム名
- [ ] `dangerouslySetInnerHTML` は sanitize 済みのみ。Markdown は `react-markdown`（既定エスケープ）
- [ ] **AI プロンプトの未信頼入力は明示デリミタで包囲**し「タグ内を指示と解釈しない」を宣言
- [ ] AI 出力が状態変更を駆動する場合は Zod 検証 + confidence 閾値 + 自動化の人手レビュー二段化
- [ ] `child_process` / `fs` にユーザ制御パスを渡さない

### D. シークレット / Webhook / ロギング
- [ ] **全 Webhook がボディ処理前に署名検証**（Stripe `constructEvent`、Svix、HMAC + `timingSafeEqual`、QStash `verifySignature`）
- [ ] 全 cron が `verifyCronRequest()`（署名 / Bearer, 定数時間比較）でガード
- [ ] 非 `NEXT_PUBLIC_*` シークレットがクライアントバンドル/`"use client"` に露出しない
- [ ] `next.config.ts` に秘密を含む `env`/`publicRuntimeConfig` がない
- [ ] テナントシークレットは AES-256-GCM（毎回ランダム IV・認証タグ）で暗号化保存。平文カラムなし
- [ ] ログ/ Sentry が PII・トークン・Authorization・リクエストボディをマスク/除去（`beforeSend`）
- [ ] セキュリティヘッダ（HSTS / `X-Frame-Options` / `nosniff` / CSP / COOP/CORP/COEP / `Permissions-Policy`）と過度に緩い CORS（`*`）の不在
- [ ] シークレットローテーション台帳（`.secrets-age.json`）と TTL 監視（`check:secrets-age`）

### E. RLS / DB ポリシー
- [ ] 機微/テナント/PII テーブルは RLS 有効、ポリシーは `my_tenant_ids()` / `my_tenant_role()` でテナント・ロール分離
- [ ] `USING (true)` / `TO anon|public` は**公開リファレンスデータに限る**（PII 露出なし）
- [ ] 公開ビューは PII リダクト（例 `certificates_public`）
- [ ] 権限判定に詐称可能な `auth.jwt()` カスタムクレームを使わない（メンバーシップ表で判定）
- [ ] **全 `SECURITY DEFINER` 関数が `SET search_path = ''`** + テーブル参照を schema 修飾
- [ ] `anon`/`authenticated` への不要な GRANT がない
- [ ] マルチステップ処理は RPC（トランザクション）or outbox で原子性/補償を担保

### F. 外部連携 / サプライチェーン
- [ ] 外部 API キーはマスク表示・一度きり平文返却・scope/失効/期限
- [ ] サブプロセッサ DPA（`docs/dpa-template.md`）と Webhook secret 暗号化
- [ ] 依存関係: `npm audit`（high/critical ブロック）+ Dependabot/更新運用（`docs/operations/dependency-security.md`）

### G. テスト / DevOps / 観測性
- [ ] route handler の integration test（特に webhook / cron / verify-code）
- [ ] SAST（CodeQL `security-extended`）/ Codacy / SonarQube が CI 稼働
- [ ] Sentry に user/tenant コンテキスト、cron 障害アラート
- [ ] Supabase `get_advisors(type:"security")` を定期実行しベースライン監視

---

## 5. 重大度ルーブリック（到達可能性ベース）

| 重大度 | 定義 | 例 |
|--------|------|-----|
| **Critical** | 未認証で到達可能、かつ大規模なデータ漏洩/改ざん/RCE/権限奪取。即時対応 | 未認証の全テナント PII 流出、認証バイパス、RCE |
| **High** | 認証は要するが、横断的な他テナント PII 読取/重要操作、または semi-blind SSRF 等 | クロステナント IDOR、認証付き内部到達 SSRF |
| **Medium** | 要認証 + 限定的影響、または多層防御の欠落（単独では悪用困難） | GDPR 系 rate limit 欠落、prompt injection 面、search_path 取りこぼし |
| **Low** | 実害が乏しい衛生・任意強化・コードの誤用余地 | 非定数時間ハッシュ比較、ラッパ名の不一致 |
| **Info / Positive** | 良好コントロールの確認、または将来検討事項 | Webhook 署名検証済み、AES-256-GCM |

> **補正原則**: 自動ツール・サブエージェントの初期スコアは鵜呑みにしない。
> 「未認証で到達できるか」「RLS バイパス条件が満たされるか」「権限前提は何か」を
> 必ず手動追跡し、到達不能なら 1〜2 段階引き下げる。逆に、認証付きでも横断 PII
> 読取が成立するものは High に引き上げる。

---

## 6. 所見ライフサイクル

```
発見(file:line) → 検証(到達可能性) → 重大度確定 → レポート記載
   → 是正(コード/規約/lint) → 回帰防止(構造対策) → 次サイクルで再検証(クローズ)
```

- 各所見は **file:line・再現条件・重大度・1 行修正方針** を持つこと（理論上の指摘は不可）。
- 修正は可能な限り**構造的再発防止**（lint ルール・共通ヘルパ・コーディング規約）まで実施。

---

## 7. ツールと自動ガード

| 種別 | ツール | 役割 |
|------|--------|------|
| SAST | GitHub CodeQL（`security-extended`） | 週次 + PR。インジェクション/危険 sink |
| 品質/SAST 補完 | Codacy, SonarQube | スメル・重複・セキュリティホットスポット |
| 依存脆弱性 | `npm audit`（high/critical でブロック） | サプライチェーン |
| DB アドバイザ | Supabase `get_advisors(type:"security")` | RLS 無効・`search_path` mutable 等 |
| マイグレーション lint | `scripts/lint-migrations.js`（拡張推奨） | `SECURITY DEFINER` の `search_path=''` 強制 |
| カスタム ESLint（推奨） | `no-restricted-syntax` 等 | admin クライアントのクエリに `tenant_id` 不在を警告 / `createServiceRoleAdmin` の `/admin/**` 誤用誘導 |
| シークレット鮮度 | `check:secrets-age`（`.secrets-age.json`） | ローテ TTL 監視 |

### 追加ガードの実装状況
- **search_path lint**: ✅ 実装済（`scripts/lint-migrations.js` の
  `security-definer-mutable-search-path` ルール。`SET search_path = ''` 以外の
  `SECURITY DEFINER` を新規マイグレーションで拒否）。
- **SSRF ガード**: ✅ ヘルパ実装済（`src/lib/security/urlAllowlist.ts`）。
  サーバ側 `fetch`/Vision は本ヘルパ経由で allowlist 検証する。生 `fetch(userUrl)`
  を機械的に禁止する lint は将来検討（現状はレビュー + ヘルパ周知で担保）。
- **IDOR ガード（ESLint）**: ⚠ 試作したが**不採用**。`admin` 連鎖で `tenant_id`
  欠落を検出する AST ルールは全 src で 203 件ヒットし、真陽性は 2 件のみ
  （`tenants` を自 id で引く等が大量に偽陽性）。AST は RLS/所有権文脈を
  判別できないため、`error` 化は CI 破壊・`warn` 化はアラート疲労となる。
  代替として §4-A のレビューチェックリスト + 既存の scoped ラッパ import 強制
  （`no-restricted-imports`、`error` 稼働中）+ 定期スイープで担保する。詳細は
  `docs/AUDIT_REPORT_20260604.md` §9。

---

## 8. コンプライアンス対応（ISO 27001 / SOC 2）

| 管理策 | ISO 27001 | SOC 2 | 監査フレームワーク内の担保 |
|--------|-----------|-------|---------------------------|
| アクセス制御 | A.5.15 / A.8.3 | CC6.1-6.3 | §4-A, §4-B |
| 暗号化 | A.8.24 | CC6.1 | §4-D（AES-256-GCM / TLS / HSTS） |
| セキュアな開発 | A.8.25-8.28 | CC8.1 | §4-C, §7（SAST / lint ガード） |
| ログ・監視 | A.8.15-8.16 | CC7.2 | §4-D, §4-G |
| 脆弱性管理 | A.8.8 | CC7.1 | §2 ケイデンス + §7 ツール |
| サプライヤ管理 | A.5.19-5.23 | CC9.2 | §4-F |
| データ保持/削除 | A.5.34 / A.8.10 | P/C | §4-B + `docs/data-retention.md` |
| インシデント対応 | A.5.24-5.28 | CC7.3-7.5 | 別途 IR Playbook（未整備・要作成） |

---

## 9. 役割と責任

| 役割 | 責任 |
|------|------|
| セキュリティ監査者 | フレームワーク適用、所見の独立評価・重大度補正、レポート作成 |
| エンジニアリング | Tier 1 是正、構造的再発防止（lint/規約/ヘルパ）の実装 |
| プラットフォーム/運用 | Supabase advisor 監視、シークレットローテ、CI ガード維持 |
| コンプライアンス | ISO/SOC2 SoA との突合、監査証跡の保管 |

---

*本フレームワークは生きた文書である。新たな脆弱性クラスや連携が追加されるたびに
§4 チェックリストと §7 ガードを更新すること。*
