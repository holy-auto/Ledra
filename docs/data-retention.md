# データ保持ポリシー

各テーブルの retention 期間と削除ポリシー。`/api/cron/data-retention` が
日次で実行し、期限超過行を物理削除またはアーカイブする。

## ポリシー一覧

| テーブル | 保持期間 | 削除ポリシー | 根拠 |
|---------|---------|-------------|------|
| `customer_login_codes` | **30 日** | 物理削除 | OTP 履歴。攻撃調査用に 30 日あれば十分 |
| `customer_portal_login_tokens` | **expires_at + 30 日** | 物理削除 | LINE ログインリンク。連携・再発行のたびに増えるので溜めない |
| `customer_sessions` | **revoked_at + 90 日** | 物理削除 | revoke 後の調査用 |
| `audit_logs` (一般) | **2 年** | アーカイブ → 削除 | コンプラ + 訴訟対応 |
| `audit_logs` (billing) | **7 年** | アーカイブのみ | 国税法 (帳簿書類) |
| `notification_logs` | **180 日** | 物理削除 | 配送調査用 |
| `outbox_events` (delivered) | **90 日** | 物理削除 | 既配送の証跡が不要になる時点 |
| `outbox_events` (dead_letter) | **2 年** | 保持 | 障害調査 + 是正記録 |
| `stripe_processed_events` | **90 日** | 物理削除 | 冪等性チェックの window |
| `reservations.work_lat/lng/work_gps_at` | **完了 (work_completed_at) + 90 日** | 座標を NULL 化（行は保持） | 出張作業場所の位置情報は顧客宅になり得るため最小権限・短期保持。真正性照合の基準として保持期間内のみ必要 |
| `inventory_movements` | **無期限** | 保持 | 監査証跡 |
| `certificates` | **無期限** | 論理削除 (status='archived') | 顧客の権利 / 改ざん検知の信頼性 |
| `vehicle_passports` | **無期限** | 論理削除 | 同上 |
| `customer_data_exports` | **作成後 7 日** | 物理削除 | DSAR ダウンロード期限 |

## 削除リクエスト (個人情報保護法 第 30 条 / GDPR 第 17 条)

`/api/customer/data-deletion` を経由した削除リクエストは:

1. `customer_deletion_requests` に `status='pending'` で作成
2. 30 日のクーリングオフ期間 (誤請求 + 加盟店からの異議申立用)
3. 期間経過後、cron が以下を実行:
   - `customers` 行を `is_deleted=true` + PII (name/email/phone) を NULL 化
   - `certificates.customer_id` は残置 (証明書の改ざん検知信頼性のため)
   - `customer_sessions` を物理削除
   - `customer_login_codes` を物理削除
   - `customer_portal_login_tokens` は `customers` 削除時に CASCADE で消える

完全な物理削除ではなく **PII の匿名化** に留めるのは、ブロックチェーン
アンカーされた証明書ハッシュとの整合性を保つため (証明書本体は
「誰が施工したか」のテナント側情報なので削除しない)。

## アクセスリクエスト (個人情報保護法 第 33 条 / GDPR 第 15 条)

データ主体に自身の保有データを開示する「アクセス権」対応として、4 つの
ロール別エクスポート route を用意している。すべて JSON ダウンロードで
即時応答、Content-Disposition で `attachment` を付与する。

| エンドポイント | 認証 | スコープ | 含む主要テーブル |
|---|---|---|---|
| `GET /api/customer/data-export` | 顧客ポータル session cookie | (tenant, customer) | profile / certificates / vehicle_histories / reservations |
| `GET /api/admin/data-export` | owner ロールのみ | tenant 全体 | tenants / certificates / customers / vehicles / invoices / reservations / vehicle_histories / tenant_memberships |
| `GET /api/agent/data-export` | get_my_agent_status RPC で active | (agent) | agents / agent_referrals / agent_commissions / agent_payouts / agent_training_completions |
| `GET /api/insurer/data-export` | insurer admin ロールのみ | (insurer) | insurers / insurer_users / insurer_cases / insurer_tenant_contracts / insurer_access_logs |

共通仕様:

- **Rate limit**: 3 / 1時間 / (scope_id × user_id)。多重発行とリソース消費を抑制
- **権限ゲート**: admin export は owner のみ、insurer export は admin のみ。
  下位ロールには PII 一括取得を許可しない (privilege escalation gate)
- **Audit log**: admin export は `vehicle_histories` に `admin_data_export` type
  で記録 (best-effort、応答ブロックしない)
- **excluded から除外しているもの**: `auth.users` (Supabase 直接管理)、
  `tenant_secrets` (暗号化済み)、Stripe customer 詳細 (Stripe Dashboard 経由)、
  他テナント/他社の情報
- **スキーマ版**: `payload.schema_version = "1.0"`。後方互換破壊時にバンプする

### 5 MB 超 / 大容量テナント向けの将来仕様 (未実装)

現状は in-memory で全件 select → JSON serialize。証明書 1 万件 / 顧客 5 千件
を超えるテナントでは Vercel の `maxDuration=60s` を消費する可能性がある。
切り替え予定:

1. ボタン押下 → QStash に `data-export.tenant` topic で enqueue
2. worker が ZIP + 署名付き URL を Supabase Storage に生成
3. URL 期限 7 日 + Resend で当該ユーザに通知メール
4. `customer_data_exports` テーブル (retention 7日) に履歴

### Lighthouse 接続前のオペレーション

- [ ] 法務レビュー済 retention テーブルを利用規約ページに転載
- [ ] 削除 (Erasure) リクエスト UI を admin / agent / insurer 向けに追加
- [ ] アクセスリクエスト記録を専用テーブル化 (現状 audit_log のみ)

## 実装

cron route: `src/app/api/cron/data-retention/route.ts` (実装済)

スケジュール: `vercel.json` の cron で日次 (03:00 JST) 実行。
処理時間が `maxDuration` (60s) を超える場合は QStash に分割。

## 残作業

- [ ] アーカイブ先 (S3 / R2) の構成と書き出しスクリプト
- [ ] `customer_data_exports` テーブル (今は API レスポンスのみ。
      非同期生成 + 7 日保管にしたら削除対象になる)
- [ ] 顧客向け削除リクエスト UI
- [ ] 法務レビュー済の retention table を `tokusho` ページに転載
