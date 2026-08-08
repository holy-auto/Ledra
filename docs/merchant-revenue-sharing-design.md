# 加盟店レポート収益還元 — 設計書

## 1. 背景と狙い

車両全履歴レポート（`/v/[vin]` の有料ペイウォール、`vehicle_report_orders`）は、
第三者（買取店・整備工場・保険査定など）が ¥3,000 を払って、1 台の VIN に紐づく
**複数施工店の施工記録を横断して**閲覧するもの。

現状、この売上は 100% プラットフォーム取り分で、**記録を残した施工店には 1 円も
還元されていない**。しかし記録を作ったのは施工店であり、その記録が後年に閲覧されて
売上を生む。つまり「今日残した 1 件が、3 年後に誰かが見るたび収益になる」という
**「技術が、資産になる。」の実装そのもの**が、収益還元として存在すべきである。

本設計は、レポート売上を、その VIN に記録を残した施工店へ **記録件数に比例して
按分し、蓄積台帳に計上**する仕組みを定義する（実送金は後精算）。

## 2. 事業ルール（確定）

| 項目 | 決定 | 備考 |
| --- | --- | --- |
| 施工店還元の合計割合 | **売上の 70%**（残り 30% がプラットフォーム取り分） | 設定値 `merchant_share_bps`（bps）で後から変更可能 |
| 施工店間の按分 | **記録（アンカー済み証明書）件数に比例** | 多く残した店ほど多く受け取る |
| 支払方法 | **蓄積台帳 → 後精算** | 実送金は既存 Stripe Connect 送金経路を後日再利用。未送金でも「あなたのレポート収益」を可視化 |

### 按分ロジック（丸め）

日本円は最小単位が 1 円（ゼロ小数）。次の順で 1 円も過不足なく配分する。

1. **還元総額プール** `pool = floor(amount_jpy * merchant_share_bps / 10000)`
   （残り `amount_jpy - pool` がプラットフォーム取り分）
2. 各施工店 `i` の按分基礎配分 `floor(pool * cert_count_i / total_cert_count)`
3. `pool - Σ(floor)` の**丸め残差**を、記録件数の多い施工店から 1 円ずつ配分
   （記録件数が同じ場合は tenant_id 昇順で決定的に）

これにより `Σ(施工店配分) == pool` が常に成り立ち、円が生成も消失もしない。

### 「記録」の定義

按分の重み `cert_count` は、その VIN（正規化 VIN）に紐づく **opt-in 車両
（`vehicles.passport_opt_out = false`）の証明書のうち、ブロックチェーンに
アンカー済み（`certificate_images.polygon_tx_hash IS NOT NULL` が 1 枚以上）の
もの**を、`certificates.tenant_id` でグルーピングした件数。`/v/[vin]` の
公開履歴タイムラインに実際に表示される記録と定義を一致させる（`getPassportData` と
同じ抽出条件）。

## 3. データモデル

### 3.1 `vehicle_report_settings`（既存シングルトンに列追加）

```sql
ALTER TABLE vehicle_report_settings
  ADD COLUMN merchant_share_bps integer NOT NULL DEFAULT 7000
    CHECK (merchant_share_bps >= 0 AND merchant_share_bps <= 10000);
```

- `7000` bps = 70%。プラットフォーム運営が価格と同じ画面で変更できる。

### 3.2 `vehicle_report_revenue_shares`（新設・蓄積台帳）

1 レポート売上 × 施工店ごとに 1 行。`agent_commissions` のライフサイクルを踏襲。

| 列 | 型 | 説明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `order_id` | uuid FK→`vehicle_report_orders` | 発生元の売上 |
| `tenant_id` | uuid FK→`tenants` | 還元先の施工店 |
| `vin_code_normalized` | text | 監査・集計用 |
| `cert_count` | integer | この施工店がこの VIN に残したアンカー済み記録件数（按分の重み） |
| `total_cert_count` | integer | この VIN の全施工店合計件数（按分の透明性のため保存） |
| `sale_amount_jpy` | integer | 元の売上額（スナップショット） |
| `share_bps` | integer | 計上時の還元率スナップショット |
| `amount` | integer | この施工店への按分後の金額（円） |
| `currency` | text default 'jpy' | |
| `status` | text | `pending`/`approved`/`paid`/`failed`/`cancelled`/`reversed` |
| `stripe_transfer_id` | text | 後精算時に記録 |
| `paid_at` | timestamptz | |
| `created_at`/`updated_at` | timestamptz | |

- **冪等キー**: `UNIQUE (order_id, tenant_id)`。paid 化の 2 経路（webhook / unlock）
  から二重に呼ばれても `ON CONFLICT DO NOTHING` で二重計上しない。
- **RLS**: 書き込みは service-role のみ（匿名購入者はこのテーブルに触れない）。
  読み取りは施工店ポータルがサーバ側で `tenant_id` スコープして取得する
  （`createTenantScopedAdmin` パターン）。

## 4. 計算のトリガーと冪等性

レポート注文が `paid` になる経路は 2 つあり、どちらも同じ結果に収束する。

1. Stripe webhook `checkout.session.completed`（`src/app/api/stripe/webhook/route.ts`）
2. 成功 URL の unlock ルート（webhook 遅延時のフォールバック、
   `src/app/api/public/vehicle-report/unlock/route.ts`）

両経路の「paid 確定」直後に `recordVehicleReportRevenueShares(orderId)` を呼ぶ。
関数は次を保証する。

- 注文が `paid` でなければ何もしない。
- 台帳行を `UNIQUE(order_id, tenant_id)` の upsert（ignoreDuplicates）で挿入 →
  何度呼んでも 1 売上につき 1 セットのみ。
- アンカー済み記録が 0 件（＝按分先なし）の場合は計上をスキップ（プラットフォーム
  全取り）。ログに残す。

按分の純粋関数 `splitRevenueByRecordCount(saleAmount, shareBps, perTenantCounts)` は
副作用を持たず、単体テストで丸め残差の配分を検証する。

## 5. 施工店への可視化（「技術が、資産になる。」を伝える）

施工店ポータル `/admin/report-revenue`（サーバコンポーネント）で、自テナントの
`vehicle_report_revenue_shares` を集計表示する。

- 見出しコピー: **「あなたの記録が生んだ収益」** — 残した記録が後年の閲覧で
  収益に変わることを 1 文で説明。
- 累計還元額・件数、直近の内訳（VIN 末尾 6 桁・件数・金額・状態）。
- サイドバー nav（証明書の近く）＋ feature catalog に追加（`payments:view`）。

## 6. 実送金（後続で実装済み: 20260730100000）

蓄積台帳を、代理店コミッションと同じ Stripe Connect レールで精算する。

- **承認ゲート（人手）**: 台帳は `pending` で積む。プラットフォーム管理者が
  `PATCH /api/admin/platform/report-revenue/<id>`（`approve`）で `pending → approved`。
  還元率 70% の妥当性を確認してから承認する運用（お金の急所を人手で止める）。
- **精算**: `payVehicleReportRevenueShare`（`src/lib/vehicleReport/payout.ts`）が
  `approved` の share を Stripe Transfer（`metadata.source_type=vehicle_report` +
  `source_id`、idempotencyKey 付き）で送金し、`stripe_transfer_id` を刻む。
  実際の確定は **connect-webhook** の `transfer.paid` が `share.status=paid` に、
  `transfer.reversed` が `reversed` にする（agent_commission と同一機構）。
- **バッチ**: cron `/api/cron/vehicle-report-payout`（毎日 05:20 UTC、`withCronLock`）が
  `approved` かつ未送金の share を一括精算。連携済み施工店のみ送金し、未連携は
  `tenant_not_onboarded` でスキップ（施工店ポータルに Stripe 連携導線を表示）。
- **オンボーディング導線**: テナントの Stripe Connect は既存の `/admin/settings`
  （`tenants.stripe_connect_account_id` / `stripe_connect_onboarded`）を再利用。
  `/admin/report-revenue` は未精算かつ未連携のとき登録 CTA を出す。

## 7. 返金時の台帳巻き戻し（後続で実装済み）

- **送金の取消**: connect-webhook `transfer.reversed` → 該当 share を `reversed`。
- **売上の返金**: メイン webhook `charge.refunded`（全額返金のみ）→ その注文の
  `stripe_payment_intent_id` から `vehicle_report_orders` を引き、
  `reverseVehicleReportRevenueSharesForOrder` で各 share を巻き戻す。
  送金ディスパッチ済み（transfer_id あり）の share は Stripe Transfer を reversal し
  （webhook が `reversed` へ）、未送金の share は `cancelled`。注文は `refunded` に。
  巻き戻し判定は純粋関数 `reversalActionForStatus`（単体テスト）で決定的に行う。
  部分返金は対象外（ponytail: 天井＝比率按分の部分 reversal は未対応）。

## 8. スコープ外（今回もやらない）

- 部分返金への対応（全額返金のみ巻き戻す）。
- 承認・精算の専用管理 UI（現状は platform-admin API のみ。一覧は
  `GET /api/admin/platform/report-revenue?status=pending`）。

## 7. 検証（この設計の合否）

- 単体テスト: `splitRevenueByRecordCount` が (a) 合計＝プール、(b) 件数比例、
  (c) 丸め残差が件数上位へ、(d) 記録 0 件で空配列、を満たす。
- 冪等性: 同一 `order_id` で 2 回計上しても行数が増えない（UNIQUE 制約）。

## 9. 段階式レポート（部分 / フル）とスコープ按分（後続で実装: 20260730200000）

無料サマリ → 部分レポート → 全履歴フル、の段階式（ラダー）課金に拡張する。

### ティア

`vehicle_report_tiers`（プラットフォーム共通）で定義する。初期シード:

| tier_key | label | price | scope_type | scope_months |
| --- | --- | --- | --- | --- |
| `recent12` | 直近1年レポート | ¥1,500 | `recent_months` | 12 |
| `full` | 全履歴レポート | ¥3,000 | `full` | （なし） |

- 無料サマリは「未購入」の状態そのもの（ティア行ではない）。
- `scope_type`: `full`（全期間）/ `recent_months`（直近 N ヶ月）。将来 `service_type` 等の
  軸を追加してもスキーマ変更なしで足せる形にする（列追加のみ）。

### スコープの意味と**按分の核心制約**

各注文（`vehicle_report_orders`）は購入時のティアの `tier_key` / `scope_type` /
`scope_months` をスナップショットとして持つ。

- **公開範囲**: `/v/[vin]` は、その購入が解錠したスコープ内の記録だけを表示する
  （`recent_months` なら「作成日 ≥ now − N ヶ月」の証明書のみ）。上位ティアへの
  アップグレード導線を出す。
- **還元の按分（重要）**: 還元は **その購入で実際に開示した記録に対してのみ** 按分する。
  部分レポートの売上を、そのスコープ外（表示していない）施工店へ分配してはならない
  （見せていない店が儲かる不整合の防止）。実装は `getExposedCertCountsByTenant(vin, scope)`
  がスコープでフィルタした件数を返し、`splitRevenueByRecordCount` に渡す。
- **段階（複数回購入）**: 同一 VIN を部分→フルと別々に買った場合、各購入は独立した
  売上として、それぞれのスコープに応じて按分する。異なる売上をまたいだ二重計上は
  「不当」ではない（別々の支払い＝別々の収益）ため、売上横断の重複排除はしない。

### スコープ判定（純粋関数・テスト対象）

`isCreatedAtInScope(createdAtMs, scope, nowMs)`:
- `full` → 常に true。
- `recent_months` → `createdAt ≥ (now の N ヶ月前)`。カレンダー月で計算（`setMonth`）。

### 購入時アンカー（scope_from）— ドリフト防止

`recent_months` は相対（閲覧時刻基準）だと、30 日のアクセス期間中に境界が動き、
購入時に見えた記録が後で消える／按分とズレる。これを防ぐため、**購入時に絶対カットオフ
`scope_from = now − N ヶ月` を確定して `vehicle_report_orders.scope_from` に保存**し、
(a) `/v/[vin]` 表示フィルタ（`created_at ≥ scope_from`）と (b) 還元按分の記録抽出
（同 `scope_from` で `.gte`）の**両方が同一の絶対境界**を使う。これにより「買い手が
見える範囲」＝「施工店が還元を受ける範囲」がアクセス期間中ずっと一致する。
`isCreatedAtInScope`（相対判定・テスト済み）は checkout で `scope_from` を求める際に使う。
