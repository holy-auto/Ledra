# Stripe 本番切替チェックリスト

## 1. 必須環境変数

Vercel の本番環境 (Production) に以下を設定すること。

| 変数名 | 用途 | 確認 |
|--------|------|------|
| `STRIPE_SECRET_KEY` | 本番 Secret Key (`sk_live_...`) | [ ] |
| `STRIPE_WEBHOOK_SECRET` | 本番 Webhook Signing Secret (`whsec_...`) | [ ] |
| `STRIPE_PRICE_STARTER` | テナント月額スタータープラン Price ID | [ ] |
| `STRIPE_PRICE_STANDARD` | テナント月額スタンダードプラン Price ID | [ ] |
| `STRIPE_PRICE_PRO` | テナント月額プロプラン Price ID | [ ] |
| `STRIPE_PRICE_STARTER_ANNUAL` | テナント年額スタータープラン Price ID | [ ] |
| `STRIPE_PRICE_STANDARD_ANNUAL` | テナント年額スタンダードプラン Price ID | [ ] |
| `STRIPE_PRICE_PRO_ANNUAL` | テナント年額プロプラン Price ID | [ ] |
| `STRIPE_PRICE_MINI` | 旧 mini プラン互換 Price ID (移行済みなら空可) | [ ] |
| `STRIPE_INSURER_PRICE_BASIC` | 保険会社ベーシック Price ID | [ ] |
| `STRIPE_INSURER_PRICE_PRO` | 保険会社プロ Price ID | [ ] |
| `STRIPE_INSURER_PRICE_ENTERPRISE` | 保険会社エンタープライズ Price ID | [ ] |
| `STRIPE_PRICE_TEMPLATE_PRESET_SETUP` | テンプレートプリセット初期費用 | [ ] |
| `STRIPE_PRICE_TEMPLATE_PRESET_MONTHLY` | テンプレートプリセット月額 | [ ] |
| `STRIPE_PRICE_TEMPLATE_CUSTOM_SETUP` | テンプレートカスタム初期費用 | [ ] |
| `STRIPE_PRICE_TEMPLATE_CUSTOM_MONTHLY` | テンプレートカスタム月額 | [ ] |
| `STRIPE_COUPON_LAUNCH_100_STANDARD` | 初期100店舗キャンペーン Coupon ID (Standard) | [ ] |
| `STRIPE_COUPON_LAUNCH_100_PRO` | 初期100店舗キャンペーン Coupon ID (Pro) | [ ] |
| `CAMPAIGN_LAUNCH_100_MAX_SLOTS` | キャンペーン最大枠数 | [ ] |

## 2. Stripe ダッシュボード設定

### Webhook エンドポイント登録
- [ ] 本番ドメインの Webhook URL を登録: `https://app.cartrust.co.jp/api/stripe/webhook`
- [ ] 以下のイベントを有効化:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `account.updated` (Stripe Connect 用)
- [ ] Signing Secret を `STRIPE_WEBHOOK_SECRET` に設定

### Stripe Connect (決済リンク機能)
- [ ] Connect プラットフォームが有効であること
- [ ] account.updated イベントが有効であること

### Price / Product 作成
- [ ] テナント月額プラン 3種 (starter / standard / pro) を作成
- [ ] テナント年額プラン 3種を作成 (20% OFF)
- [ ] 保険会社プラン 3種 (basic / pro / enterprise) を作成
- [ ] テンプレートオプション 4種 (preset setup/monthly, custom setup/monthly) を作成
- [ ] 各 Price ID を環境変数に設定

### Coupon 作成
- [ ] 初期100店舗キャンペーン用 Coupon を作成 (Standard / Pro)
- [ ] Coupon ID を環境変数に設定

## 3. コード側の確認事項

### Webhook 署名検証
- [x] `stripe.webhooks.constructEvent()` で署名検証実施済み
- [x] 不正な署名は 400 エラーで拒否

### サブスクリプション同期ロジック
- [x] checkout.session.completed → subscription retrieve → DB 同期
- [x] subscription created/updated/deleted → plan_tier / is_active 同期
- [x] invoice.paid/payment_failed → subscription 経由で同期
- [x] テナント / 保険会社 / テンプレートオプションの3系統に対応
- [x] Stripe Connect account.updated → onboarding 状態同期
- [x] キャンペーン枠確定 (invoice.paid)

### Checkout セッション
- [x] 認証済みユーザーのみ作成可能 (access_token 必須)
- [x] tenant_id はサーバー側で解決 (クロステナント攻撃を防止)
- [x] success_url / cancel_url は APP_URL ベース

### Billing Portal
- [x] access_token 認証済み
- [x] open redirect 対策実施済み

### 初期費用 (Setup Fee)
- [x] Standard: 29,800円, Pro: 49,800円
- [x] キャンペーン適用時はスキップ

## 4. テスト手順

### 本番移行前 (テスト環境)
- [ ] `sk_test_` キーで Checkout フロー通し実行
- [ ] Webhook が正しく受信され、DB が更新されることを確認
- [ ] Plan upgrade / downgrade が反映されることを確認
- [ ] Subscription cancel → is_active: false になることを確認
- [ ] invoice.payment_failed → past_due 状態を確認
- [ ] Billing Portal でプラン変更・カード変更が動作すること
- [ ] キャンペーン割引が正しく適用されること

### 本番移行後
- [ ] 最初の 1 件を実際の本番カードで決済し、DB 反映を確認
- [ ] Webhook 配信ログで 200 応答を確認
- [ ] Stripe ダッシュボードでサブスクリプション状態を目視確認
- [ ] Sentry でエラーが出ていないことを確認

## 5. 既知の注意事項

| 項目 | 説明 |
|------|------|
| `apiVersion` | `2025-02-24.acacia` を使用。Stripe SDK v20+ 対応。 |
| `current_period_end` | SDK v20 で Subscription 直下から SubscriptionItem に移動。互換処理あり (`getCurrentPeriodEnd()`) |
| `past_due` の扱い | `active`/`trialing`/`past_due` を有効状態として扱う (`isActiveStatus()`) |
| Grace Period | `BILLING_GRACE_DAYS` (デフォルト14日) で公開PDF の猶予期間を制御 |
| Mini プラン互換 | `STRIPE_PRICE_MINI` で旧プランから starter への自動マッピングあり |

## 6. ロールバック手順

万が一本番切替後に問題が発生した場合:
1. Vercel で `STRIPE_SECRET_KEY` を test キーに戻す
2. Webhook エンドポイントを無効化
3. 手動で affected テナントの `is_active` / `plan_tier` を修正
