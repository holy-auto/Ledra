# 予約 → 請求完了 導線 検証レポート (2026-06)

デモアカウントで顧客にプレゼンする際の「予約 (reservation) → 請求完了 (billing)」
導線が、各ステップ結線され完結できるかを検証した記録。あわせて発見した 2 つの穴を
修正した。

## 結論

導線は**全ステップ結線済み**で、手動操作で完結する。検証で見つかった具体的な穴は
2 点で、本ブランチで両方修正した。

| # | 穴 | 影響 | 対応 |
|---|-----|------|------|
| 1 | デモアカウントに予約・請求のシードが無い | デモを「既存の予約」から開始できず、各ステージを見せられない | `scripts/setup-demo-tenant.ts` に予約 7 件 / 請求書 3 件をシード |
| 2 | Stripe 決済リンクで顧客が支払っても請求書が `paid` に自動更新されない | 「請求完了」が手動の入金ボタン頼みで、自動決済の導線が閉じない | `stripe/webhook` に `checkout.session.completed` → 請求書 `paid` 分岐を追加 |

## 導線マップ (各ステップと結線)

### 1. 予約作成
- UI: `/admin/reservations` (`ReservationsClient.tsx`)
- API: `POST /api/admin/reservations` (`reservationCreateSchema` 検証)
- 出力: `reservations` 行 (`customer_id` / `vehicle_id` / `status='confirmed'` / `estimated_amount` / `menu_items_json`)

### 2. 予約ライフサイクル (受付 → 作業 → 完了)
- API: `POST /api/admin/reservations/[id]/advance`
- 遷移: `confirmed → arrived → in_progress → completed` (`cancelled` は任意時点)
- 到達時刻 (`work_started_at` / `work_completed_at`) を記録、最終ステップで `completed`。

### 3. 予約 → 請求書の変換
- 入口: `/admin/invoices/new?reservation_id={id}` → `/admin/invoices?...&create=1&reservation_id={id}`
- AI 下書き: `POST /api/admin/invoices/ai-from-job` が予約の `menu_items_json` / `estimated_amount` /
  顧客・車両から明細・税率・宛名を生成 (`InvoicesClient.tsx` が自動プリフィル)。
- データ受け渡し: 予約の `customer_id` / `vehicle_id` / 明細が請求書へ流れる。
- 注意: `documents` に `reservation_id` 列は無く、作成後の逆引きは customer/vehicle 経由のみ
  (本検証では導線完結の妨げにならないため未対応。監査用途で必要なら別途列追加を検討)。

### 4. 請求書発行
- API: `POST /api/admin/invoices` (`doc_number` 自動採番 `INV-YYYYMM-NNN`、税率別内訳を算出)
- PDF: `GET /admin/invoices/pdf?id={invoiceId}`

### 5. 支払い・請求完了
- 手動: `PUT /api/admin/invoices` (`status: draft → sent → paid`、`payment_date` 記録)
  - 詳細画面のステータスボタン / 一覧の「入金」ダイアログ。
- 自動 (LINE 決済リンク): `POST /api/admin/invoices/[id]/send-line-payment-link`
  → `createInvoicePaymentLink` (Stripe Connect, `mode=payment`, `metadata.invoice_id`)
  → 顧客が決済 → **`checkout.session.completed` webhook で `paid` に自動更新** (本修正で結線)。

## 修正詳細

### 穴1: デモシード (`scripts/setup-demo-tenant.ts`)
- 予約 7 件: `confirmed` ×2 / `arrived` ×1 / `in_progress` ×1 / `completed` ×2 / `cancelled` ×1。
  既存のデモ顧客・車両に紐付け、各ステージをそのまま見せられる。
- 請求書 3 件: `draft` / `sent` / `paid` の各ステージ。`completed` 予約 2 件に対応する
  請求書 (入金済・送付済) と下書き 1 件。`paid` は `payment_date` 入り。
- 既存の堅牢な `upsert` ヘルパ (未知カラム自動除去 / CHECK 違反 type スキップ) を利用するため、
  プロジェクト間のスキーマ差にも耐える。`--reset` でテナント削除時に cascade で消える。

### 穴2: Stripe 決済リンク → 請求書 paid 自動化 (`src/app/api/stripe/webhook/route.ts`)
- `checkout.session.completed` に `session.metadata.invoice_id` 分岐を追加。
- `documents` を `status='paid'` / `payment_date=今日` に更新。
- 冪等性: webhook 先頭の event-id claim に加え `.neq("status","paid")` で、手動入金や
  Stripe 再送と二重更新しない。`metadata.tenant_id` で追加スコープ (誤テナント更新の最終防壁)。
- 配送経路: 決済リンクは `transfer_data.destination` の destination charge のため、イベントは
  プラットフォーム宛 = この main webhook に届く (connect-webhook ではない)。

## 検証
- `npx vitest run src/app/api/stripe/webhook/__tests__/route.test.ts` … ✅ 8 passed
- `npx tsc --noEmit` … ✅ 0 errors
- `npx eslint` (変更ファイル) … ✅ 0 errors

## デモ進行例 (修正後)
1. `/admin/reservations` … 各ステージの予約が並ぶ。
2. `confirmed` の予約を `advance` で 受付 → 作業中 → 完了 へ。
3. 完了予約から `/admin/invoices/new?reservation_id=...` → AI が請求書を下書き。
4. 保存 (`draft`) → 「送付済」(`sent`) → PDF 表示。
5. 「LINE で決済リンクを送る」→ 顧客決済 → webhook が自動で「入金済」(`paid`)。
   (または一覧の「入金」で手動完了)
6. シード済みの `paid` 請求書で「請求完了」の最終状態も即見せられる。
