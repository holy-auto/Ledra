# 追加作業費一覧・キャンペーン課金仕様・プラン組み合わせ表

---

## 1. 追加作業費一覧

### 料金ページ掲載版

```
────────────────────────────────────
追加作業費（税込）
────────────────────────────────────

テンプレートの変更が必要な場合、
以下の費用で承ります。

┌───────────────────────────┬──────────┐
│ 作業内容                   │ 費用      │
├───────────────────────────┼──────────┤
│ 文言修正                   │ ¥5,500〜 │
│ （保証文言・注意文言の変更）  │          │
├───────────────────────────┼──────────┤
│ レイアウト調整              │ ¥11,000〜│
│ （配置・構成の変更）         │          │
├───────────────────────────┼──────────┤
│ QR/URL差し替え              │ ¥3,300〜 │
│ （メンテナンスURL変更）      │          │
├───────────────────────────┼──────────┤
│ テンプレート追加制作         │ ¥33,000〜│
│ （2つ目以降のテンプレート）   │ ¥55,000  │
├───────────────────────────┼──────────┤
│ 大幅再設計                  │ 別途見積  │
│ （フルリニューアル）         │          │
└───────────────────────────┴──────────┘

※ ライトプランの場合、ロゴ・配色・文言の
  変更は管理画面からいつでも無料で行えます。
※ 上記は制作作業が発生する場合の費用です。
※ 作業内容を確認の上、お見積りをご連絡します。
※ お支払い確認後に作業を開始します。
────────────────────────────────────
```

### 内部用見積基準表

| 作業種別 | 最低金額 | 標準金額 | 上限目安 | 工数目安 | 判断基準 |
|---|---|---|---|---|---|
| 文言修正（1箇所） | ¥5,500 | ¥5,500 | ¥8,800 | 30分 | テキスト差替のみ |
| 文言修正（複数箇所） | ¥8,800 | ¥8,800 | ¥16,500 | 1時間 | 3箇所以上の同時変更 |
| レイアウト調整（軽微） | ¥11,000 | ¥11,000 | ¥22,000 | 1時間 | 余白・位置の微調整 |
| レイアウト調整（中規模） | ¥22,000 | ¥22,000 | ¥44,000 | 2-3時間 | セクション追加・構成変更 |
| QR/URL差し替え | ¥3,300 | ¥3,300 | ¥5,500 | 30分 | URL・ラベル変更 |
| テンプレ追加（既製ベース） | ¥33,000 | ¥33,000 | ¥44,000 | 3時間 | 既製テンプレ選択+カスタム |
| テンプレ追加（オリジナル） | ¥55,000 | ¥55,000 | ¥77,000 | 5時間 | B相当のフルカスタム |
| 大幅再設計 | ¥88,000 | ¥110,000 | ¥165,000 | 8-15時間 | レイアウト全面変更 |

### Stripe Invoice 発行パターン

```typescript
// 追加作業のStripe Invoice発行例
const invoice = await stripe.invoices.create({
  customer: tenant.stripe_customer_id,
  collection_method: 'send_invoice',
  days_until_due: 7,
  description: 'CARTRUST ブランド証明書 追加作業',
});

await stripe.invoiceItems.create({
  customer: tenant.stripe_customer_id,
  invoice: invoice.id,
  amount: 5500, // ¥5,500
  currency: 'jpy',
  description: '文言修正（保証文言の変更）',
});

await stripe.invoices.sendInvoice(invoice.id);
```

---

## 2. 先着100社キャンペーン課金仕様

### キャンペーン概要

| 項目 | 通常価格 | キャンペーン価格 | 割引率 |
|---|---|---|---|
| A 初期費用 | ¥16,500 | **¥0** | 100% OFF |
| A 月額 | ¥3,300 | ¥3,300（据置） | — |
| B 初期費用 | ¥88,000 | **¥55,000** | 37.5% OFF |
| B 月額 | ¥4,400 | ¥4,400（据置） | — |

### キャンペーン条件
1. 先着100社（A/B合算でカウント）
2. 適用条件: 新規契約のみ（既存契約者のプラン変更には適用不可）
3. 最低利用期間: **6ヶ月**
4. 6ヶ月以内の解約: キャンペーン割引分を全額請求
   - A: ¥16,500 を請求
   - B: ¥33,000（¥88,000 - ¥55,000）を請求
5. キャンペーン期間: 申込日から起算（終了日は別途告知）

### Stripe実装方針

```
# Stripe Couponの設計

## A用クーポン
coupon_id: TEMPLATE_LAUNCH_A
amount_off: 16500 (JPY)
duration: once
max_redemptions: 100 (A/B合算管理は別途)
metadata:
  campaign: template_launch_100
  option_type: preset

## B用クーポン
coupon_id: TEMPLATE_LAUNCH_B
amount_off: 33000 (JPY)
duration: once
max_redemptions: 100
metadata:
  campaign: template_launch_100
  option_type: custom
```

### 残数管理

```typescript
// キャンペーン残数チェック関数
async function checkCampaignAvailability(): Promise<{
  available: boolean;
  remaining: number;
}> {
  const { count } = await supabaseAdmin
    .from('tenant_option_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_code', 'TEMPLATE_LAUNCH_100')
    .not('status', 'eq', 'cancelled');

  const remaining = 100 - (count ?? 0);
  return {
    available: remaining > 0,
    remaining: Math.max(0, remaining),
  };
}
```

### キャンペーン表示文言

```
─────────────────────────────────────────
🎉 先着100社限定 ローンチキャンペーン

ブランド証明書オプションの導入を
特別価格でお試しいただけます。

ライト:    初期費用 ¥16,500 → ¥0
プレミアム: 初期費用 ¥88,000 → ¥55,000

残り {remaining} 社
─────────────────────────────────────────

※ 月額費用は通常価格となります。
※ 最低利用期間6ヶ月の条件があります。
※ 6ヶ月以内の解約の場合、割引分を
  別途ご請求いたします。
```

### 6ヶ月縛りの実装

```typescript
// 解約時の割引返還チェック
async function checkEarlyTerminationFee(
  subscriptionId: string
): Promise<{ fee: number; reason: string } | null> {
  const sub = await supabaseAdmin
    .from('tenant_option_subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .single();

  if (!sub.data?.campaign_code) return null;

  const startedAt = new Date(sub.data.started_at);
  const sixMonthsLater = new Date(startedAt);
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

  if (new Date() < sixMonthsLater) {
    const fee = sub.data.discount_amount ?? 0;
    return {
      fee,
      reason: `キャンペーン最低利用期間（6ヶ月）内の解約のため、割引分 ¥${fee.toLocaleString()} をご請求いたします。`,
    };
  }
  return null;
}
```

---

## 3. 既存プランとの組み合わせ表

### 料金一覧

| ベースプラン | テンプレオプション | 月額合計 | 初期費用 | ターゲット |
|---|---|---|---|---|
| ミニ ¥980 | なし | **¥980** | — | 最小限で始めたい個人店 |
| ミニ ¥980 | A ライト ¥3,300 | **¥4,280** | ¥16,500 | ロゴだけ入れたい小規模店 |
| スタンダード ¥2,980 | なし | **¥2,980** | — | テンプレ管理・帳票が必要な店 |
| スタンダード ¥2,980 | A ライト ¥3,300 | **¥6,280** | ¥16,500 | 証明書ブランド化も欲しい中規模店 |
| スタンダード ¥2,980 | B プレミアム ¥4,400 | **¥7,380** | ¥88,000 | こだわりのある中規模店 |
| プロ ¥9,800 | なし | **¥9,800** | — | フル機能が必要な大規模店 |
| プロ ¥9,800 | A ライト ¥3,300 | **¥13,100** | ¥16,500 | ブランド証明書も欲しいプロ店 |
| プロ ¥9,800 | B プレミアム ¥4,400 | **¥14,200** | ¥88,000 | 最高級を求めるディテーリング店 |

### 注意点
- テンプレートオプションはベースプランとは **独立したStripeサブスクリプション**
- ベースプランが `cancelled` になっても、オプション契約は技術的には存続する
  - ただし証明書発行ができなくなるため、実質的に利用不可
  - この場合、オプション側も自動で `suspended` にする（Webhook連動）
- ベースプランのアップグレード/ダウングレードはオプション契約に影響しない
- A→Bへのアップグレード時:
  - A の初期費用（¥16,500）をB初期費用（¥88,000）から差し引き → 差額¥71,500を請求
  - A の月額サブスクを解約 → B の月額サブスクを新規作成
  - A の tenant_template_configs をベースに B の設定を作成

### 機能マトリクス（プラン×オプション）

| 機能 | ミニ | ミニ+A | 標準 | 標準+A | 標準+B | プロ | プロ+A | プロ+B |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 証明書発行 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| PDF出力 | 単体 | 単体 | ZIP | ZIP | ZIP | ZIP | ZIP | ZIP |
| テンプレ管理 | — | — | ○ | ○ | ○ | ○ | ○ | ○ |
| ロゴアップロード | — | ○* | — | ○* | ○* | ○ | ○ | ○ |
| ブランドテンプレ | — | ○ | — | ○ | ○ | — | ○ | ○ |
| ロゴ差替 | — | ○ | — | ○ | ○ | — | ○ | ○ |
| 配色変更 | — | ○ | — | ○ | ○ | — | ○ | ○ |
| 文言カスタム | — | 200字 | — | 200字 | 500字 | — | 200字 | 500字 |
| レイアウト調整 | — | — | — | — | ○ | — | — | ○ |
| カスタムセクション | — | — | — | — | 3つ | — | — | 3つ |
| フォント変更 | — | — | — | — | ○ | — | — | ○ |
| メンテナンスURL | — | 1件 | — | 1件 | 3件 | — | 1件 | 3件 |
| テスト発行 | — | 月3回 | — | 月3回 | 月5回 | — | 月3回 | 月5回 |

※ ミニ+A: ロゴアップロードはプロプラン機能だが、Aオプション契約により証明書へのロゴ反映が可能

### Stripe上の商品/価格ID設計

```
# 環境変数に追加

## テンプレートオプション - ライト（A）
STRIPE_PRICE_TEMPLATE_PRESET_SETUP=price_xxx     # 初期費用 ¥16,500（one_time）
STRIPE_PRICE_TEMPLATE_PRESET_MONTHLY=price_xxx    # 月額 ¥3,300（recurring/monthly）

## テンプレートオプション - プレミアム（B）
STRIPE_PRICE_TEMPLATE_CUSTOM_SETUP=price_xxx      # 初期費用 ¥88,000（one_time）
STRIPE_PRICE_TEMPLATE_CUSTOM_MONTHLY=price_xxx    # 月額 ¥4,400（recurring/monthly）

## キャンペーン用クーポン
STRIPE_COUPON_TEMPLATE_LAUNCH_A=coupon_xxx         # A初期費用100%OFF
STRIPE_COUPON_TEMPLATE_LAUNCH_B=coupon_xxx         # B初期費用¥33,000OFF
```

### Stripe Checkout Session 構成

```typescript
// A（ライト）申込
const session = await stripe.checkout.sessions.create({
  customer: tenant.stripe_customer_id,
  mode: 'subscription',
  line_items: [
    {
      price: process.env.STRIPE_PRICE_TEMPLATE_PRESET_SETUP,
      quantity: 1,
    },
    {
      price: process.env.STRIPE_PRICE_TEMPLATE_PRESET_MONTHLY,
      quantity: 1,
    },
  ],
  // キャンペーン適用時
  ...(campaignAvailable ? {
    discounts: [{ coupon: process.env.STRIPE_COUPON_TEMPLATE_LAUNCH_A }],
  } : {}),
  success_url: `${baseUrl}/admin/template-options/configure/{CHECKOUT_SESSION_ID}?status=success`,
  cancel_url: `${baseUrl}/admin/template-options/gallery?status=cancel`,
  metadata: {
    tenant_id: tenant.id,
    option_type: 'preset',
    platform_template_id: selectedTemplateId,
  },
});

// B（プレミアム）申込 — 初期費用のみ（月額は公開時に別途作成）
const session = await stripe.checkout.sessions.create({
  customer: tenant.stripe_customer_id,
  mode: 'payment',
  line_items: [
    {
      price: process.env.STRIPE_PRICE_TEMPLATE_CUSTOM_SETUP,
      quantity: 1,
    },
  ],
  ...(campaignAvailable ? {
    discounts: [{ coupon: process.env.STRIPE_COUPON_TEMPLATE_LAUNCH_B }],
  } : {}),
  success_url: `${baseUrl}/admin/template-options/order/{CHECKOUT_SESSION_ID}?status=success`,
  cancel_url: `${baseUrl}/admin/template-options/order?status=cancel`,
  metadata: {
    tenant_id: tenant.id,
    option_type: 'custom',
    order_type: 'custom_production',
  },
});
```

### option subscription の状態管理方針

```
┌─────────────┐
│   (新規)      │
└──────┬──────┘
       │ Stripe Checkout完了
       ▼
┌─────────────┐
│   active     │ ← 正常状態
└──┬──────┬───┘
   │      │ 支払い失敗
   │      ▼
   │ ┌─────────────┐
   │ │  past_due    │ ← Stripeリトライ中（3回）
   │ └──┬──────┬───┘
   │    │      │ リトライ全失敗
   │    │      ▼
   │    │ ┌─────────────┐
   │    │ │  suspended   │ ← 7日間猶予→テンプレ停止
   │    │ └──┬──────┬───┘
   │    │    │      │ 30日経過
   │    │    │      ▼
   │    │    │ ┌─────────────┐
   │    │    │ │  cancelled   │ ← 完全解約
   │    │    │ └─────────────┘
   │    │    │
   │    │ 支払い成功
   │    │    │
   │    ▼    ▼
   └──→ active に復帰
   │
   │ 加盟店が解約
   ▼
┌─────────────┐
│  cancelled   │ ← cancel_at_period_end=true で期間終了時に移行
└─────────────┘
```

### Webhook処理

```typescript
// POST /api/stripe/webhook
// テンプレートオプション関連のWebhookイベント処理

switch (event.type) {
  case 'checkout.session.completed': {
    const session = event.data.object;
    if (session.metadata?.option_type === 'preset') {
      // A: 即座にサブスク+テンプレ設定を作成
      await createPresetSubscription(session);
    } else if (session.metadata?.option_type === 'custom') {
      // B: オーダーのステータスを paid に更新
      await updateOrderStatus(session, 'paid');
    }
    break;
  }

  case 'invoice.paid': {
    // 月額の正常支払い or 追加作業の支払い
    const invoice = event.data.object;
    if (invoice.metadata?.template_order_id) {
      await updateOrderStatus(invoice, 'paid');
    }
    break;
  }

  case 'invoice.payment_failed': {
    // 支払い失敗 → past_due
    await updateSubscriptionStatus(event, 'past_due');
    break;
  }

  case 'customer.subscription.deleted': {
    // サブスク削除 → cancelled
    await updateSubscriptionStatus(event, 'cancelled');
    // テンプレ設定を suspended に
    await suspendTemplateConfig(event);
    break;
  }

  case 'customer.subscription.updated': {
    // ステータス変更の同期
    const sub = event.data.object;
    await syncSubscriptionStatus(sub);
    break;
  }
}
```
