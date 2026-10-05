# エンタープライズ調達対応 ステータスシート

> 用途: 保険会社 / OEM / 大規模工場ネットワーク調達担当者から渡される
> Security Questionnaire への回答テンプレ。RFP/DDQ で繰り返し聞かれる
> 項目を「Ledra 側でどう実装/運用しているか」と「証跡」のセットで整理。
> 関連: `docs/sso-setup.md` / `docs/dpa-template.md` /
> `docs/disaster-recovery.md` / `docs/operations-guide.md` /
> `docs/iso27001-soc2-prep.md` / `docs/data-retention.md`

---

## 0. ステータス凡例

- ✅ **Ready** — 本番運用済み、エビデンス即提示可
- 🟡 **In place** — コードは入っているが Dashboard 設定や運用が前提
- ⚠️ **Roadmap** — 設計済み未実装、想定リリース時期を併記

---

## 1. 認証・認可

| 項目 | 状態 | 実装 / 証跡 |
|---|---|---|
| パスワード認証 | ✅ | Supabase Auth (`signInWithPassword`)。最小8文字、12文字推奨 (LOW-2 audit issue) |
| MFA (TOTP) | ✅ | `src/lib/auth/mfa.ts` — Supabase MFA factors |
| SSO (SAML 2.0) | 🟡 | `src/lib/auth/sso.ts` + `/api/auth/sso/start` + login UI ボタン配線済。`tenants.sso_required` + `sso_email_domain` で強制可能。**IdP 登録 (`auth.sso_providers`) は顧客毎に手動**(`docs/sso-setup.md` 参照) |
| SCIM 自動プロビジョニング | ⚠️ | 未実装。Lighthouse 1 社目契約後に Okta / Azure AD 連携を着手予定 (~3週間) |
| Role-based access | ✅ | `tenant_memberships.role` (`owner`/`admin`/`staff`/`viewer`)、`requireMinRole()` で route 単位ガード |
| Platform admin 分離 | ✅ | `isPlatformAdmin()` + ESLint で service-role 直接 import を警告 |
| Customer portal 認証 | ✅ | メール OTP (5分 / 最大3試行) + 列挙耐性 (常に 200) — `docs/AUDIT_REPORT_20260503.md` MEDIUM-1 解消済 |

---

## 2. データ保護

| 項目 | 状態 | 実装 / 証跡 |
|---|---|---|
| 通信暗号化 | ✅ | TLS 1.2+ (Vercel / Supabase 双方で強制) |
| 保管時暗号化 | ✅ | Supabase は AES-256 / Storage は server-side encryption (S3) |
| RLS (Row-Level Security) | ✅ | 全テナント分離テーブルで `tenant_id` ベース RLS。`createTenantScopedAdmin()` で service-role 利用も誘導 |
| Tenant cross-leak 防御 | ✅ | ESLint で `getSupabaseAdmin()` 直接 import を警告 + `__scopedTenantId` 経由必須 |
| バックアップ | 🟡 | Supabase 自動バックアップ 30日 / PITR 1分粒度 (Pro 必須)。`docs/disaster-recovery.md` 参照 |
| Read Replica | 🟡 | `getReadReplica()` 経由で透過対応済。Pro 化 + `SUPABASE_REPLICA_URL` 設定で有効化 |
| データ削除 (GDPR Erasure) | 🟡 | `/api/customer/data-deletion` 実装済 (customer scope)。admin/agent/insurer 向けは roadmap |
| データエクスポート | ✅ | 4 スコープ全て JSON ダウンロード対応: `/api/customer/data-export` / `/api/admin/data-export` (owner only) / `/api/agent/data-export` / `/api/insurer/data-export` (admin only)。Rate limit 3/h、5 MB 超は QStash 非同期に切替予定。`docs/data-retention.md` 参照 |
| データ保持ポリシー | ✅ | `docs/data-retention.md` + `/api/cron/data-retention` で自動削除 |

---

## 3. 可観測性 / インシデント対応

| 項目 | 状態 | 実装 / 証跡 |
|---|---|---|
| Structured logging | ✅ | `src/lib/logger.ts` (JSON 1行、secret 自動マスク) |
| Correlation ID | ✅ | `proxy.ts` で `x-request-id` 採番・伝播・echo |
| エラートラッキング | ✅ | Sentry (`sentry.*.config.ts`)、user/tenant context 注入済 |
| Webhook 信頼性 | 🟡 | Stripe webhook: payload 保存 + 完了マーク + 監視 cron (5分間隔、stuck 検知で Resend alert) |
| ヘルスチェック | ✅ | `/api/health` で DB / Replica / Stripe / Env vars を返却 |
| Rate limiting | ✅ | Upstash Redis + in-memory fallback。プリセット `general/auth/webhook/mobile_*` |
| インシデントランブック | 🟡 | `docs/operations-guide.md` + `docs/disaster-recovery.md`。on-call ローテはまだ非整備 |
| SLA | ⚠️ | `docs/slo.md` ドラフトあり。契約締結時に正式化 |

---

## 4. アプリケーションセキュリティ

| 項目 | 状態 | 実装 / 証跡 |
|---|---|---|
| Input validation | ✅ | Zod (POST/PUT 247 ルートが `safeParse` カバレッジ 95%+) |
| CSRF | ✅ | `proxy.ts` で Origin / sec-fetch-site fallback 検証 |
| SQL injection | ✅ | Supabase は PostgREST 経由パラメタライズ済 |
| XSS | ✅ | `escapeHtml` ヘルパ + React デフォルトエスケープ |
| Secret 管理 | ✅ | Vercel env vars。コード上では logger が pepper/api_key/token 等を自動マスク |
| 監査ログ | ✅ | `audit_logs` テーブル + `logAuditEvent()` ヘルパ |
| 依存脆弱性スキャン | ✅ | CI で `npm audit` (high/critical)、CodeQL 週次、Semgrep 追加予定 |
| SAST | ✅ | GitHub CodeQL (security-extended) 設定済 (`.github/workflows/codeql.yml`) |

---

## 5. インフラストラクチャ

| 項目 | 状態 | 実装 / 証跡 |
|---|---|---|
| 地理リージョン | ✅ | Vercel `hnd1` (東京) + Supabase 東京リージョン |
| 単一障害点 (SPOF) | 🟡 | Supabase は SPOF だが PITR + Replica + DR ランブックで RTO 4h / RPO 24h 担保。`docs/architecture-roadmap.md` §3 |
| マルチAZ | ✅ | Vercel / Supabase ともに AWS マルチAZ |
| DDoS 防御 | ✅ | Vercel Edge Network |
| WAF | 🟡 | Vercel Firewall (Pro 機能)。本番化のタイミングで有効化 |
| ペネトレーションテスト | ⚠️ | 内製の静的 audit のみ実施。外部 pen test は Lighthouse 接続前に発注予定 |

---

## 6. 契約・コンプライアンス

| 項目 | 状態 | 提示 / 入手 |
|---|---|---|
| 利用規約 / SLA | 🟡 | `/(marketing)/terms` あり。SLA は契約締結時 |
| プライバシーポリシー | ✅ | `/(marketing)/privacy` |
| DPA (Data Processing Agreement) | 🟡 | `docs/dpa-template.md` テンプレあり。**法務未承認 — 締結前に弁護士レビュー必須** |
| 個人情報保護法対応 | ✅ | 令和4年改正対応 (DPA テンプレ第1条) |
| GDPR (EU 顧客向け) | ⚠️ | 日本国内顧客のみ想定。EU 拡大時は別途整備 |
| ISO27001 / SOC2 | ⚠️ | `docs/iso27001-soc2-prep.md` で gap 分析中。Lighthouse 経由で取得スケジュール検討 |
| サブプロセッサ一覧 | ✅ | Supabase / Vercel / Stripe / Resend / Upstash / Sentry / Anthropic — `docs/dpa-template.md` 付録 |

---

## 7. 質問が来やすい「個別の聞かれ方」テンプレ

### Q. データを EU/US に置きませんよね?
A. はい。Supabase は ap-northeast-1 (東京) を primary、Vercel は hnd1 (東京) を primary としています。Sentry / Anthropic API への外送はメタデータ (エラースタック / プロンプト) のみで、顧客 PII は送信しません。

### Q. 社員退職時にアクセスを切れますか?
A. 切れます。Owner ロールから `tenant_memberships` の対象行を `revoked_at` で論理削除すれば即時セッションが失効します (`proxy.ts` がセッションリフレッシュ時に検査)。SSO 利用時は IdP 側で deactivate すれば次のセッションリフレッシュ (~1時間以内) で自動的に切断されます。

### Q. ログはどれくらい保持しますか?
A. `audit_logs` は無期限 (圧縮対象)、Vercel ログは Log Drain 設定次第 (デフォルト 1 ヶ月)。Sentry は 30 日。`docs/data-retention.md` 参照。

### Q. 監査証跡を提供できますか?
A. はい。`audit_logs` テーブルから CSV エクスポート (`/api/admin/audit/export`、未実装 — 接続前に追加)、または Supabase Studio から直接取得可能。

### Q. SSO は強制できますか?
A. はい。`tenants.sso_required = true` + `sso_email_domain` を設定すると、その domain のメールはパスワード認証が画面側でブロックされます。SAML 2.0 (Supabase Auth 経由) で Okta / Azure AD / OneLogin など標準的な IdP に対応。`docs/sso-setup.md` に手順。

### Q. LINE を使わない場合、予約管理・通知はどうなりますか?
A. `tenants.line_enabled = false` でテナント単位に LINE 機能を無効化できます。予約データ本体 (`reservations` テーブル) は LINE 非依存の列構成で、`line_user_id` も nullable のため LINE なしで予約フローが完結します。顧客ポータルのログインは既定がメール + 電話番号下4桁 OTP で、LINE ログインはあくまで連携済み顧客向けの代替経路 (`src/lib/customerPortalLineLogin.ts`)。予約通知はメール (Resend) / SMS (Twilio) / Slack が既に稼働しており、`src/lib/notifications/routing.ts` の `disabledChannels` / `additionalChannels` でテナント単位にチャネルを上書き可能。**現状の制約**: チャネル切替はテナント単位までで、従業員/顧客個人ごとの通知チャネル選択は未実装 (`src/lib/notifications/types.ts:37`)。また通知18タイプ中15タイプは本番で未発火 — 発火要否・宛先・チャネルは個別に代表判断が必要 (`docs/context/OPEN_QUESTIONS.md` 2026-08-31)。

### Q. データの削除をリクエストされたらどう対応しますか?
A. 顧客 (エンドユーザ) は `/customer/[tenant]/data-deletion` から自己リクエスト可。30 日の検証期間後に PII を物理削除します (audit_logs は anonymize)。テナント (加盟店) の解約時は契約終了から 90 日以内に全データを削除し、削除完了証明書を発行します。

### Q. データ漏えい発生時の通知時間は?
A. 個情委への通知は事案を覚知してから「速やかに」(現実的には 72時間以内)、データ主体への通知は影響範囲特定後に開始。`docs/operations-guide.md` のインシデント対応セクション参照。

---

## 8. リリース判定 (Lighthouse = **損保ジャパン** 接続前にクリアすべき項目)

> Lighthouse は 2026-05-13 に **損保ジャパン** で確定。詳細な接続計画と
> 業務フロー検証は `docs/lighthouse-sompo-japan.md` を参照。

- [ ] DPA を法務レビュー → 損保ジャパン側のテンプレと突合 → 正式版に置き換え
- [ ] 外部ペネトレーションテスト発注 → critical 0 件で接続
- [ ] 損保ジャパンの SAML IdP メタデータを Supabase に登録、`@sompo-japan.co.jp` で SSO 強制
- [ ] SCIM プロビジョニング MVP (~3週間)
- [ ] WAF 有効化 (Vercel Pro)
- [ ] SOC2 Type 1 観測期間開始 (3 ヶ月)
- [ ] On-call ローテ整備 (週次担当者 + PagerDuty 連携)
- [ ] `/api/admin/audit/export` 実装 (監査担当者向け)
