# Passport API 従量課金 (Stripe metered billing) セットアップ

外部の Passport 検証 API 利用者 (`passport_api_consumers`) に対して Stripe
で従量課金するための手順書です。コードは既に揃っています。本書は **Stripe
ダッシュボード側で 1 回だけ実行する初期設定** と、本番投入前の検証手順をまとめます。

関連コード:

| 役割 | ファイル |
|---|---|
| 月次集計 + Stripe 報告 | `src/lib/passport/billing.ts` |
| Cron エンドポイント | `src/app/api/cron/passport-billing/route.ts` |
| Cron スケジュール (`0 17 1 * *` = 02:00 JST 月の 2 日) | `vercel.json` |
| Consumer 編集 UI | `src/app/admin/platform/passport-consumers/[id]/` |
| DB スキーマ | `supabase/migrations/20260526000002_passport_api_billing.sql` |

---

## 0. 動作モデル

- 月次 cron が **前月分** の `passport_api_call_logs` を consumer 別に COUNT
- `passport_api_billing_periods` に (consumer × 月) で 1 行 upsert
- `passport_api_consumers.stripe_subscription_item_id` が設定されている
  consumer のみ、Stripe `subscription_items.createUsageRecord` を
  **`action: "set"`** で呼ぶ → cron 再実行時も同月 usage を上書きするだけ
- `subscription_item_id` 未設定の consumer は内部集計のみ続行 (手動請求用)

## 1. Stripe ダッシュボード側のセットアップ (運営 1 回)

### 1.1 metered Product を作成

1. Stripe Dashboard → Products → **+ Add product**
2. **Name**: `Passport Verification API`
3. **Pricing**:
   - Type: **Metered**
   - Pricing model: **Standard** (per-unit pricing) — 例: 1 コールあたり 10 円
   - Currency: `JPY`
   - Usage aggregation: **Sum of usage values during period**
4. Save → 表示される `price_xxxxx` を控える (consumer 側のサブスクリプションで参照)

複数階層 (例: 「1〜1000 まで無料、それ以降 10 円」) にしたい場合は
**Pricing model: Graduated** を選び、tier を組む。

### 1.2 consumer ごとに Customer + Subscription を作成

Stripe Dashboard で or CLI で:

```bash
# Customer 作成
stripe customers create \
  --name "中古車店 ABC" \
  --email ops@example.com
# → cus_xxxxxxxx を控える

# Subscription を metered price で作成
stripe subscriptions create \
  --customer cus_xxxxxxxx \
  --items "price=price_xxxxxxxx"
# → 返ってきた subscription.items[0].id (si_xxxxxxxx) が
#    `passport_api_consumers.stripe_subscription_item_id` にあたる
```

### 1.3 Ledra 側で連携 ID を設定

`/admin/platform/passport-consumers/<id>` の「Stripe metered billing 連携」
セクションで:

- **Stripe Customer ID**: `cus_xxxxxxxx`
- **Subscription Item ID**: `si_xxxxxxxx`

両方を保存。両方とも空にすると Stripe 報告を停止し、内部集計のみ続行する。

## 2. 月次 cron の手動 (replay) 実行

`?period=YYYY-MM` で任意の月を強制リプレイできます。`action=set` のおかげで
何回呼んでも同月の usage は同じ数字に収束するため、テスト・補正どちらにも安全。

```bash
# 本番
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://app.example.com/api/cron/passport-billing?period=2026-04"

# レスポンス例:
# {
#   "ok": true,
#   "period_start": "2026-04-01", "period_end": "2026-05-01",
#   "consumers": [
#     { "consumerId": "...", "status": "reported", "callCount": 42,
#       "stripeUsageRecordId": "mbur_..." }, ...
#   ],
#   "reported_count": 1, "recorded_count": 1, "skipped_count": 1, "failed_count": 0
# }
```

## 3. 本番投入前の検証 (Stripe Test mode)

1. `STRIPE_SECRET_KEY` を **test mode key** (`sk_test_...`) に向ける
2. 上記 1.1 → 1.2 を test mode の Stripe Dashboard で実行
3. テスト用 consumer を Ledra に作成 → API キーを発行 → 数回 `/api/v1/passport/verify` を叩く
4. cron を手動実行 (`?period=YYYY-MM` で今月分を指定)
5. Stripe Dashboard → Customer → Upcoming invoice で **Usage line** に
   報告した回数が反映されているのを確認
6. cron を **再実行** して同じ回数で固定される (倍にならない) ことを確認

## 4. トラブルシューティング

### 4.1 Cron が走っているが Stripe に届かない
- Consumer の `stripe_subscription_item_id` が null になっていないか
- `/admin/platform/passport-consumers/<id>` の「請求期間」表で **last_error**
  を確認 (Stripe 側のエラーメッセージが保存される)
- Stripe Subscription が `incomplete` 状態 / 一時停止になっていないか

### 4.2 失敗した月だけ別途リプレイしたい
- 手動 cron `?period=YYYY-MM` を該当月で実行
- 内部の `passport_api_billing_periods` 行は同じ ID で上書きされ、
  Stripe 側も `action=set` で同じ usage record id を更新

### 4.3 consumer を一時停止したい
- Ledra: `status` を `suspended` にすると次回 cron で `skipped` 扱い
- Stripe: subscription を pause すれば請求側も止まる

## 5. 将来の拡張案

- [ ] 階層料金 (volume tier) のサンプル config
- [ ] consumer 側に「現在の今月利用回数」を返すダッシュボード用 API
- [ ] cron 失敗連続 N 回で運営にアラートメール
