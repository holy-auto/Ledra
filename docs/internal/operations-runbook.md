# CARTRUST 運用ランブック

## 1. 障害対応フロー

### 初動手順
1. Sentryアラートまたはユーザー報告で障害を検知
2. `/api/health` でシステム全体の状態を確認
3. Vercel Dashboard でデプロイ状態を確認
4. Supabase Dashboard でDB状態を確認

### 障害レベル分類
| レベル | 定義 | 対応時間 | エスカレーション |
|--------|------|----------|-----------------|
| P0 | サービス全停止 / データ漏洩 | 即時 | 全員招集 |
| P1 | 主要機能停止（証明書発行・課金） | 30分以内 | 開発リード |
| P2 | 一部機能停止（PDF出力・通知等） | 2時間以内 | 担当者 |
| P3 | UI不具合・軽微なバグ | 翌営業日 | バックログ |

## 1.1 Sentry の限界と補完監視

### Sentry が検知できないもの
- 課金状態の不整合（Stripe と DB のズレ — subscription が active なのに is_active=false 等）
- 証明書発行数の異常な増減（エラーではなく量的異常）
- 保険会社の異常アクセスパターン（大量アクセスでもエラーにならない）
- Cron ジョブの未実行（エラーではなく「実行されない」場合 — Sentry に通知が来ない）
- Webhook の配信遅延・欠落（Stripe がリトライするため、gap が見えない）
- 認証ブロック（rate limit や 403 はエラーとして捕捉されない）

### 補完: /api/cron/monitor（毎日 08:00 JST）
日次で以下のチェックを自動実行し、問題があればメール通知する:
- **課金不整合チェック**: Stripe subscription があるが is_active=false のテナントを検出
- **24時間の証明書発行数**: 発行量の推移を記録（異常な急増・急減の把握）
- **Webhook 処理数**: stripe_processed_events の24時間件数を記録
- **保険会社アクセス量の異常検知**: 24時間で500件超のアクセスがある保険会社を検出

### アラート通知先
- `CONTACT_EMAIL_TO` 環境変数に設定されたメールアドレス
- Resend API 経由で送信（RESEND_API_KEY が未設定の場合はスキップ）

## 2. よくある障害と対応

### 2.1 Supabase接続エラー
**症状**: API が 500 を返す、ログに "DB unreachable"
**確認**:
- Supabase Dashboard → Project Status
- `/api/health` の database チェック
**対応**:
- Supabase 側の障害: ステータスページ確認、回復待ち
- 接続数上限: Supabase Dashboard → Database → Connections 確認
- RLS ポリシーエラー: Supabase SQL Editor でポリシー確認

### 2.2 Stripe Webhook 失敗
**症状**: 課金状態が更新されない、Stripe Dashboard に失敗イベント
**確認**:
- Stripe Dashboard → Webhooks → Recent events
- Vercel ログで "stripe webhook handler failed" を検索
- `/api/health` の stripe チェック
**対応**:
- Webhook URL が正しいか確認 (本番: https://app.cartrust.co.jp/api/stripe/webhook)
- STRIPE_WEBHOOK_SECRET が正しいか確認
- Stripe Dashboard から失敗イベントを手動再送信

### 2.3 メール送信失敗
**症状**: OTP メールが届かない、フォローアップが送信されない
**確認**:
- Resend Dashboard → Logs
- Vercel ログで "Resend API error" を検索
**対応**:
- RESEND_API_KEY の有効性確認
- 送信ドメインの DNS 設定確認
- 月間送信上限の確認

### 2.4 課金状態の不整合
**症状**: 支払済みなのに機能が制限される / 未払いなのに使える
**確認**:
- Stripe Dashboard → Customer → Subscription 状態
- Supabase → tenants テーブル → plan_tier, is_active
**対応**:
1. Stripe の正しい状態を確認
2. Supabase の tenants テーブルを手動更新:
   ```sql
   UPDATE tenants SET plan_tier = 'standard', is_active = true
   WHERE stripe_subscription_id = 'sub_xxx';
   ```
3. Stripe Dashboard から Webhook を再送信して自動同期

### 2.5 保険会社アクセス問題
**症状**: 保険会社が証明書を検索できない
**確認**:
- `insurer_tenant_contracts` テーブルで契約状態確認
- `insurer_users` テーブルでユーザー状態確認
**対応**:
```sql
-- 契約確認
SELECT * FROM insurer_tenant_contracts
WHERE insurer_id = 'xxx' AND status = 'active';

-- 契約追加
INSERT INTO insurer_tenant_contracts (insurer_id, tenant_id)
VALUES ('insurer-uuid', 'tenant-uuid');
```

## 3. 定期運用タスク

### 日次
- [ ] Sentry エラー確認（新規エラー有無）
- [ ] `/api/cron/monitor` の実行結果を確認（アラートメールの有無）
- [ ] Stripe Dashboard で失敗したWebhookがないか確認

### 週次
- [ ] Vercel Analytics でエラー率確認
- [ ] Supabase Dashboard でDB使用量確認
- [ ] 未処理のサポートチケット確認

### 月次
- [ ] Stripe の月次売上・解約率確認
- [ ] DB バックアップの復元テスト
- [ ] 依存パッケージのセキュリティアップデート確認

## 4. データベース緊急操作

### バックアップ
- Supabase は自動で毎日バックアップ（Pro プラン）
- 手動バックアップ: Supabase Dashboard → Database → Backups

### データ復旧
1. Supabase Dashboard → Database → Backups → Point-in-time Recovery
2. 復旧時刻を選択して復元
3. 復元後、Stripe との整合性を確認

### 緊急 SQL
```sql
-- テナントの課金を即時無効化（重大な問題発生時）
UPDATE tenants SET is_active = false WHERE id = 'tenant-uuid';

-- 保険会社のアクセスを即時停止
UPDATE insurers SET status = 'suspended' WHERE id = 'insurer-uuid';

-- 全保険会社契約を一時停止（緊急時）
UPDATE insurer_tenant_contracts SET status = 'suspended'
WHERE insurer_id = 'insurer-uuid';
```

## 5. デプロイ手順

### 通常デプロイ
1. `main` ブランチに PR をマージ
2. Vercel が自動デプロイ
3. Sentry でデプロイ後のエラー率を監視

### ロールバック
1. Vercel Dashboard → Deployments
2. 前回の正常なデプロイを選択 → "Promote to Production"
3. DB マイグレーションのロールバックが必要な場合は手動で逆マイグレーション

### DB マイグレーション
1. `supabase/migrations/` に SQL ファイルを追加
2. Supabase Dashboard → SQL Editor で実行
3. 本番適用後はマイグレーションファイルを削除しない

## 6. 連絡先

| 役割 | 担当 | 連絡手段 |
|------|------|----------|
| 開発リード | TBD | Slack / 電話 |
| インフラ | Vercel / Supabase | サポートチケット |
| 決済 | Stripe | サポートチケット |
| メール | Resend | サポートチケット |
