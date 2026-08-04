# RELEASE_LOG.md — 実装・公開した変更

> 「何を実装してリリースしたか」を人が読める粒度で記録する場所。コミット単位の
> 詳細は `git log` を参照すればよいので、ここには機能単位のサマリだけを書く。
> 新しい変更は先頭に追記（新しい順）。

## 記入フォーマット

```
## YYYY-MM-DD 変更タイトル (PR #番号 / commit)
- 内容: 何を実装・変更したか
- 対象: どの画面・API・業種向けか
```

## 2026-08-02 メールリンク/サインアップ/SSO の PKCE コールバックを同一オリジンへ戻す修正 (branch claude/email-sso-login-issue-1f9upn)
- 内容: `resolveBaseUrl` に opt-in の `preferRequestOrigin` を追加し、magic-link / signup(パスワードレス) /
  sso-start の `emailRedirectTo`/`redirectTo` をリクエストと同一オリジンに変更。PKCE の code_verifier Cookie は
  リクエストオリジンに張られるため、コールバックが APP_URL(正規ドメイン)だと交換に失敗してログインできない問題を是正。
  純関数の単体テスト `src/lib/__tests__/url.test.ts` を追加。
- 対象: ログイン導線（`/api/auth/magic-link`, `/api/signup`, `/api/auth/sso/start`）。共通ヘルパ `src/lib/url.ts`。
- 注記: 本修正の効果は「ユーザーが実アクセスするオリジンが Supabase の Redirect URLs 許可リストに含まれる」ことが前提。
  SSO は Supabase 側に IdP 未登録（プロバイダ 0 件）のため別途設定が必要。詳細は DECISION_LOG / OPEN_QUESTIONS 2026-08-02。

## 2026-08-02 証明書/保険会社系 SECURITY DEFINER 関数の search_path バレ参照＋enum バグを修復 (branch claude/payment-status-and-error-no5a9m)
- 内容: 本番 `cahybswpduchptvyvdkk` のログに `relation "certificates"/"insurers" does not exist` が継続発生。原因は `20260404000000` が4関数に `SET search_path=''` を付けた際に本体のテーブル参照を `public.` 修飾へ直さなかったこと（`20260725125332` の第1弾修正が取りこぼした4関数）。さらに `platform_certificate_stats`・`insurer_get_vehicle_certificates` は enum に無い `'expired'`（`certificate_status_enum` は active/void/draft のみ）を参照しており、バレ参照を直すと enum 例外に変わる二重バグだった。`20260802000000_fix_search_path_bare_refs_certificates_insurers.sql` で4関数を `public.` 修飾＋`status::text` 比較に修正し本番へ適用。
- 対象: `get_certificate_service_price`（証明書料金）/ `platform_certificate_stats`・`platform_insurer_count`（管理ダッシュボードのプラットフォーム統計、super_admin 表示）/ `insurer_get_vehicle_certificates`（保険会社ポータルの車両別証明書一覧）。
- 限界: 別2件のコード/スキーマ不整合は未修正で要判断として残す — `certificates.template_name`（`api/admin/vehicles/[id]/last-cert` が参照するがマイグレーション未定義）、`agents.stripe_connect_onboarded`（stripe connect webhook が参照するが列は `tenants` にのみ存在し `agents` には無い）。
- 検証: 適用後 `platform_certificate_stats()`＝{total:38, active:23, void:14, expired:0, draft:1}、`platform_insurer_count()`＝2 がエラーなく返ることを本番で確認。

## 2026-07-31 帳票管理エラー・入金済更新不可を修復（20260715* マイグレーションドリフトの再適用） (branch claude/payment-status-and-error-no5a9m)
- 内容: 本番 `cahybswpduchptvyvdkk` で `20260715000000`〜`20260715000003` の4本が `schema_migrations` に記録済みなのに DDL 未反映（ドリフト）だったため、`/api/admin/documents` の GET/PUT が `column documents.staff_member_id does not exist` で 500 になり、帳票管理の一覧表示と「入金済」への更新ができなかった。4本の DDL を冪等にまとめた修復マイグレーション `supabase/migrations/20260731144359_repair_20260715_batch_drift.sql` を新規作成し本番へ適用。復旧した機能: 帳票管理一覧・書類確認、請求書の入金済（入金確定）更新、外注請求書（staff_invoice）、支社担当者ロール（store_memberships.role）、売上分析の週別集計、外注職人のレス率。
- 対象: 管理画面 帳票管理（`/admin/documents`）・請求書入金確定 / `/api/admin/documents` GET・PUT / 本番DB スキーマ。
- 限界: 元の4マイグレーションファイルは履歴再現性のため未変更（修復は別マイグレーションで冪等再適用）。ドリフトの根本原因（記録済みなのに未適用になった経緯）は未究明で OPEN_QUESTIONS に起票。
- 検証: 適用前に FK/CHECK 検証の安全性を確認（store_memberships 0行・孤児user_id 0、documents/document_templates の doc_type 逸脱 0）。適用後、7オブジェクト（`documents.staff_member_id`／`staff_members.commission_rate`／`store_memberships.role`／documents・document_templates の doc_type CHECK の staff_invoice／RESTRICTIVE ポリシー／billing_analytics_stats の週別）の実在と、PUT ハンドラの全 SELECT 列（38列）が本番でエラーなく解決することを確認。

## ※ この先の既存エントリは base 版（275ce2d）のままです。本ブランチ（claude/display-issue-3qfbwj）は RELEASE_LOG を base に戻してコンフリクトを避けています。法人番号修正の事業ログエントリは main 側で別途反映します。
