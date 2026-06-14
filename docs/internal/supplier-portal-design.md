# 供給パートナーポータル（メーカー受注ポータル）設計メモ

> 作成: 2026-06-14
> ブランチ: `claude/optimistic-cannon-eto6w9`
> 関連: `20260601000000_supply_partners.sql`, `src/lib/supply/autoSend.ts`, `src/app/api/agent/supply/*`

---

## 0. 背景と狙い

現在、供給パートナー（卸元/メーカー）への発注の搬送は **2 通り**しかない。

| 搬送 (`purchase_orders.transport`) | 条件 | 双方向性 | 全自動送信 |
|---|---|---|---|
| `api` | メーカー側に既存の受注システム（API エンドポイント）がある | あり（先方採番の注文番号が返る） | 対象になり得る |
| `email` | システムを持たないメーカー（`api_auth_type='none'`） | **なし**（送りっぱなし・自由文返信） | 対象外（人が承認） |

問題は **メール発注の「送りっぱなし」**：メーカーが受けたか・在庫があるか・いつ出荷かが構造化されず、Ledra 側で状態を追えない。だから安全側に倒して自動送信できず、人の承認が必須のまま残る。

**狙い**：システムを持たないメーカー向けに Ledra がホストする軽量ポータルを提供し、メール発注を「構造化された双方向のやりとり」に置き換える。ポータルでは受注/欠品/辞退/出荷予定をボタンと日付で回答 → Ledra の発注ステータスに自動反映される。これにより、信頼パートナーであれば API を持たなくても全自動送信の対象に広げられる。

---

## 1. 既存資産の確認（重要：作り直さない）

設計に入る前にコードを精査した結果、**メーカー本体のテナント横断アカウントは新設不要**。既存基盤がそのまま使える。

- `supply_partners` は **platform スコープ**（テナント所有ではない）。1 メーカー = 1 行で、複数店舗が `tenant_supply_links` で提携する構造（`20260601000000_supply_partners.sql:10-12`）。
- ログイン主体は `supply_partners.owner_user_id`（= 代理店アカウント統合。`my_supply_partner_ids()` が `auth.uid()` から解決）。メーカーは既に**プロフィール・API設定・商材カタログ**を自己編集できる（`src/app/api/agent/supply/*`）。
- `tenant_supply_links` には既に **パートナー視点の SELECT ポリシー** `tsl_select_partner` がある（自分を仕入先にしている店舗を横断で閲覧可）。

→ つまり「論点1（1メーカー1アカウントで全ショップ横断）」は**既存スキーマで既に成立**している。前回メモで提案した `maker_accounts` の 2 層新設は不要だった。**`supply_partners` がそのままメーカー本体**として機能する。

### 信頼と opt-in の二軸（既存）
- `supply_partners.is_trusted`（**グローバル**・運営のみ設定・トリガ保護）= 「運営が審査した信頼パートナー」。
- `tenant_supply_auto_send_settings`（**テナント別**・enabled + 上限額）= 店舗側の opt-in。

「ホーリーオートでは自動送信ON、B商店ではまだ」はテナント別 opt-in で表現でき、is_trusted はグローバルな運営ゲートのまま。きれいに両立する。

---

## 2. 確定した要件（ユーザー合意済み）

1. **マルチショップ**：1 メーカー 1 アカウントで全提携ショップの発注を横断表示（受信トレイ集約）。
2. **欠品・数量変更を認める**：行ごとに受注数量を回答でき、差分はバックオーダーとして Ledra に戻る。
3. **通知はメール + LINE**：新規発注時にメーカーへ通知。初回オンボーディングはメール、運用は LINE。

---

## 3. 新しい搬送モデル：`transport = 'portal'`

`purchase_orders.transport` に第 3 の値 `'portal'` を追加する。

```
email   : 送りっぱなし（自由文返信）              … 既存・据え置き
api     : 先方システムへ POST（即時 ack）          … 既存・据え置き
portal  : Ledra ポータルに発注を積む → メーカーが取りに来て構造化回答 … 新規
```

`portal` は「Ledra が両側を握る」プル型のため、届く確実性は API と同等以上。よって**信頼パートナー（is_trusted）かつ portal 連携のメーカーは、API がなくても全自動送信の対象**に含める。

### 搬送の選定ロジック（メーカー単位の優先順位）
1. API 連携あり（`integration_status='connected'`）→ `api`
2. ポータル有効（`portal_enabled=true`）→ `portal`
3. いずれも無し → `email`（従来どおり）

---

## 4. メーカー側の発注ライフサイクル

```
① 通知（メール/LINE）「○件の発注が届いています → 確認する」
        ▼
② 受信トレイ（全提携ショップ横断） /supply/orders
   新着 / 進行中 / 出荷済み のタブ
        ▼
③ 発注詳細：行ごとに [受注する] [一部欠品] [辞退]
        ▼
④ 受注後：出荷予定日 + 追跡番号（任意）→ [出荷しました]
        ▼
   構造化イベントが Ledra の発注ステータスへ反映
```

### メーカーの回答（`purchase_orders.partner_response`）
| 値 | 意味 | Ledra 側の発注ステータス |
|---|---|---|
| `pending` | 未回答（ポータルに積まれた直後） | `sent`（送信済み・回答待ち） |
| `accepted` | 全量受注 | `sent` → 出荷後 `received` 候補 |
| `partial` | 一部欠品（行ごとに受注数量） | 差分をバックオーダーへ |
| `declined` | 辞退（理由つき） | 要再検討（人が再発注/取消判断） |

### 部分受注（バックオーダー）
`purchase_order_items` に行ごとの回答数量を持つ。
- `accepted_quantity`：メーカーが受けた数量
- `backorder_quantity`：`quantity - accepted_quantity`（欠品分）

差分（backorder）の扱い：
- **再発注は自動にしない**（人の承認に倒す）。自動送信 → 部分受注 → 自動再発注の無限ループを防ぐ安全側設計。
- ショップ側 UI で「欠品分を別パートナーへ再発注 / キャンセル」を選ぶ。

### 辞退理由（`decline_reason`）
選択式：`discontinued`(廃番) / `out_of_stock`(在庫切れ) / `price_mismatch`(価格不一致) / `min_lot`(最低ロット未満) / `other`。

---

## 5. 通知（メール + LINE）

### メール（既存 `sendResendEmail` を利用）
- 宛先：`supply_partners.contact_email`。
- 内容：「{店舗名}から発注が届いています」+ ポータルへのマジックリンク（既存 `/api/portal` のコード認証パターンを踏襲、または owner の Supabase auth セッション）。

### LINE（要検討：チャネルの所在）
既存の LINE 連携は **テナント単位**（`tenants.line_channel_*`、`src/lib/line/client.ts`）。だがメーカーは複数テナント横断のため、「どのテナントのチャネルで送るか」が決まらない。

**方針**：メーカー通知は **プラットフォーム共通の Ledra 公式 LINE アカウント**から送る（テナントの顧客向けチャネルとは別）。
- 新 env：`LEDRA_PARTNER_LINE_CHANNEL_ACCESS_TOKEN` 等。
- メーカーが Ledra 公式 LINE を友だち追加 → `supply_partners.line_user_id` に紐付け（連携コード方式は既存 `src/lib/line/linkCode.ts` を踏襲）。
- Phase 2 で実装。MVP はメール通知のみで成立する。

---

## 6. データモデル変更（Phase 1・additive）

`20260614000000_supply_portal_orders.sql`（冪等・additive）

```sql
-- purchase_orders.transport に 'portal' を追加（CHECK 再定義）
-- partner 回答列を追加: partner_response / partner_responded_at /
--   partner_ship_eta / partner_response_note / decline_reason
-- purchase_order_items に accepted_quantity / backorder_quantity を追加
-- supply_partners に portal_enabled / line_user_id を追加
```

RLS（Phase 2 で追加）：メーカー（`my_supply_partner_ids()`）が
- 自分宛て（`supply_partner_id IN my_supply_partner_ids()`）かつ `transport='portal'` の `purchase_orders` を **SELECT** できる。
- 同条件で `partner_response` 系の列のみ **UPDATE** できる（金額・明細は触らせない＝サーバ API 経由で検証）。

---

## 7. フェーズ計画

### Phase 1 — データ + ドメインロジック（本 PR）
- [x] 設計メモ（本ファイル）
- [x] マイグレーション（transport='portal' + 回答列 + backorder 列 + partner 列）
- [x] 型（`SupplyTransport` に portal、`SupplyPartnerResponse` enum + ラベル + 辞退理由）
- [x] 純関数 `computePortalResponse()`（行ごとの受注数量から回答状態 + backorder を算出。完全テスト可能）
- [x] `decideAutoSend()` を portal トランスポートまで拡張（信頼 portal パートナーを対象に）
- [x] ユニットテスト（portalResponse / autoSend 拡張）

### Phase 2 — メーカー側ポータル UI + API
- 受信トレイ `/supply/orders`（横断・タブ）
- 発注詳細 + 回答 API（`POST /api/agent/supply/orders/[id]/respond`）— サーバ側で数量検証・backorder 算出（Phase 1 の純関数を使用）
- RLS ポリシー追加
- メール通知（新規発注時）

### Phase 3 — ショップ側の受け皿
- 発注一覧にポータル回答状態（受注/欠品/辞退・出荷予定）を表示
- 欠品分の再発注/取消フロー
- 全自動送信 UI の文言を「API・ポータル」に更新

### Phase 4 — LINE 通知
- プラットフォーム共通 Ledra 公式 LINE チャネル
- メーカーの友だち追加 + `line_user_id` 紐付け
- 新規発注の LINE 通知（メール失敗時フォールバック含む）

---

## 8. 壁3 との整合

- ポータル投函（`transport='portal'` で `sent` にする）は外部への金額コミット。全自動送信は引き続き **`decideAutoSend()` の全条件**（opt-in + is_trusted + 構造化搬送 + 両上限 + 月次残）を満たすときのみ。
- 部分受注の差分（backorder）再発注は**自動化しない**（人の承認）。
- メーカーの回答は `partner_response` 系の列に限定し、金額・明細は API 層で検証してから反映（RLS でも列を絞る）。
