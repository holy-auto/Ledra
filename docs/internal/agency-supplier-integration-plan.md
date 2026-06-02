# 代理店経由のAI自動受発注 — API連携 設計ドラフト

> 作成: 2026-06-01
> ブランチ: `claude/clever-clarke-eC0Si`
> ステータス: **設計ドラフト（実装未着手 / 要レビュー）**

---

## 0. この文書の目的

「AI自動受発注を回すには、APIや連絡先など連携項目を誰かが入れないといけない。
**みんな商材を扱っているのだから、代理店に入ってもらい、そこでAPIや連絡先を登録してもらう**」
という方針を、Ledra の既存実装に接続した実装計画に落とす。

### 決定事項（オーナーとの確認済み）

| 論点 | 決定 | 含意 |
|---|---|---|
| 紹介と卸の関係 | **分離可**（同一会社が両方やってもよいが、店舗ごとに紹介元と仕入元が別会社でもOK） | 「供給パートナー」を `agents`(紹介) とは別エンティティにし、任意リンクで「同一会社」を表現する |
| 自動発注の出口 | **API自動発注を優先**（メール下書きは後段のフォールバックとして残す） | 送信の搬送を API 化する。ただし**承認は人**（壁3 維持） |

---

## 1. 用語の整理（重要 — 同じ「代理店」が二義ある）

Ledra には既に「代理店」という語が**別の意味で**存在する。設計前に必ず分離する。

| 概念 | 既存実装 | 役割 | このドラフトでの呼称 |
|---|---|---|---|
| **Agent（紹介代理店）** | `agents` テーブル / `/agent` ポータル / コミッション制 | 施工店を Ledra に**紹介**する販売パートナー | 「紹介エージェント」 |
| **Supplier（仕入先）** | `suppliers` テーブル（テナント単位 / 2026-05-31 新設） | 各店が自分用に登録する発注先。発注メールの宛先 | 「店舗ローカル仕入先」 |
| **供給パートナー（卸元/メーカー）** | **未実装（本ドラフトで新設）** | 商材を**卸す**主体。商材カタログ・API・連絡先を**本人が**登録 | **「供給パートナー (supply partner)」** |

> 業界の「正規代理店」（例: seed の "Adam's Polishes 日本正規代理店"）＝**商材を卸すディストリビューター**であり、
> Ledra 内部の `agents`（紹介）とは別物。本ドラフトの新エンティティは前者にあたる。

---

## 2. 既存資産（実装済み・確認済み）

このドラフトは新規の足場をほとんど作らず、**既存資産に接続**する。

### 2.1 発注の足場（2026-05-31 `20260531000010_purchase_orders.sql`）

- `suppliers`（テナント単位 / RLS: `tenant_id IN (SELECT my_tenant_ids())`）
  - 列: `name / email / phone / note / lead_time_days / is_active` のみ。**API連携項目なし**。
- `purchase_orders`: `status` (draft→approved→sent→received/cancelled) / `source` (auto|manual) / `supplier_id` / `subtotal` / `approved_by` / `sent_at` ほか
- `purchase_order_items`: 明細（`item_id` / `sku` / `quantity` / `unit_cost` / `received`）
- `inventory_items` に `supplier_id` / `reorder_qty` / `supplier_sku`（先方品番）を追加済み
- 冪等性: `uq_po_auto_open_per_supplier`（1仕入先につき同時 auto-draft は1件）

### 2.2 自動アクション基盤（`20260531000001_ai_auto_actions.sql` + `src/lib/ai/automation/`）

- 永続化: `tenant_ai_automation_settings.auto_actions`（`Record<actionKey, boolean>`）
- **全アクション既定 OFF（opt-in） / Standard プラン以上**
- 既存キー `inventory.auto_draft_reorder`: 低在庫 cron で**発注書を draft で自動起票**（承認・送信は人）
- **壁3 (`NEVER_AUTO_ACTIONS`)**: 金額の外向き確定を伴うアクションは設定で true にしても**絶対に自動実行しない**（`certificate.auto_issue` / `invoice.auto_send` / `payment.auto_charge` など）。`resolveAutoAction` (policy.ts) と sanitizer の二重ガード。

### 2.3 機微情報の暗号化（`src/lib/crypto/secretBox.ts` ほか）

- `SECRET_ENCRYPTION_KEY`（base64 32バイト）+ **AES-256-GCM**、envelope `v1.<iv>.<ct>`
- 書き込み/読み出し: `buildSecretWrite()` / `readSecret()`（`tenantSecrets.ts`）
- **既存の手本**: `accounting_integrations`（freee/MF）が
  `access_token_ciphertext` / `refresh_token_ciphertext` / `token_expires_at` / `status` /
  `last_error` / `connected_by` を持つ。**供給パートナーのAPI鍵もこの形に倣う**。
- logger は `api_key/token/secret` 等を自動マスク。

### 2.4 受発注（店舗↔店舗）の別ライン

`docs/internal/order-system-redesign-plan.md` は `job_orders`（店舗間の**役務受発注**）。
本ドラフトの「店舗↔供給パートナーの**物販発注**」は `purchase_orders` 側で、**軸が違う**。両者は混ぜない。

---

## 3. データモデル（新設）

> 設計原則（README 準拠）: 新テーブルは tenant スコープか platform スコープかを明示し RLS を書く。
> `ADD COLUMN NOT NULL DEFAULT` を避け 3 段で。`(tenant_id, ...)` 複合 index。冪等 DDL。

供給パートナーが所有するデータは**テナント横断（platform スコープ）**である点が肝。
従来の `suppliers`（テナント所有）とは**所有者が逆**になる。

### 3.1 `supply_partners` — 供給パートナー（卸元/メーカー）

```
supply_partners
  id                     uuid PK
  name                   text NOT NULL
  contact_email          text          -- 連絡先（発注フォールバックの宛先にもなる）
  contact_phone          text
  status                 text  CHECK (status IN ('pending','active','suspended')) DEFAULT 'pending'
  -- 「同一会社が紹介エージェントも兼ねる」場合のみ紐付け。NULL = 純粋な供給のみ（分離）
  agent_id               uuid NULL REFERENCES agents(id) ON DELETE SET NULL
  owner_user_id          uuid REFERENCES auth.users(id)   -- パートナーポータルのログイン主体
  -- API 連携設定（accounting_integrations に倣う）
  api_endpoint           text          -- 発注を投げる先（https のみ許可）
  api_auth_type          text  CHECK (api_auth_type IN ('none','api_key','bearer','oauth2')) DEFAULT 'none'
  api_key_ciphertext     text          -- ★平文では絶対保存しない（secretBox）
  api_secret_ciphertext  text
  api_config             jsonb         -- ヘッダ名/フィールドマッピング等の非機密設定
  integration_status     text  CHECK (... 'unconfigured','connected','error') DEFAULT 'unconfigured'
  last_order_at          timestamptz
  last_error             text
  created_at / updated_at
```

- **`agent_id` が「分離可」の要**: 設定すれば「紹介もする供給パートナー」、NULL なら「卸だけ」。
  店舗ごとの紐付け（3.4）とは独立なので、「紹介はA社・仕入はB社」も自然に表現できる。
- RLS: SELECT/UPDATE は `owner_user_id = auth.uid()`（パートナー本人）＋ platform 運営のみ。
  **店舗(tenant)は `*_ciphertext` を読めない**（発注実行はサーバ側の scoped admin が代行）。

### 3.2 `supply_partner_products` — 商材カタログ（パートナーが本人入力）

```
supply_partner_products
  id                 uuid PK
  supply_partner_id  uuid NOT NULL REFERENCES supply_partners(id) ON DELETE CASCADE
  sku                text NOT NULL        -- 先方品番（inventory_items.supplier_sku と対応）
  name               text NOT NULL
  category           text
  list_price         integer             -- 標準卸値（税抜・円）
  currency           text DEFAULT 'JPY'
  stock_status       text                -- in_stock/low/out 等（任意）
  lead_time_days     integer
  is_active          boolean DEFAULT true
  external_ref       jsonb               -- 先方システムの商品ID等
  created_at / updated_at
  UNIQUE (supply_partner_id, sku)
```

### 3.3 在庫品目 ↔ カタログのマッピング（自動化の本丸）

```
ALTER TABLE inventory_items
  ADD COLUMN supply_partner_product_id uuid NULL REFERENCES supply_partner_products(id) ON DELETE SET NULL;
```

- 既存 `supplier_id`/`supplier_sku`（店舗ローカル仕入先）と**併存**。
- これが張られた品目だけが「API自動発注」の対象になり得る（張られていなければ従来のメール発注のまま）。

### 3.4 `tenant_supply_links` — 店舗 ⇔ 供給パートナー（分離可の実体）

```
tenant_supply_links
  id                 uuid PK
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
  supply_partner_id  uuid NOT NULL REFERENCES supply_partners(id) ON DELETE CASCADE
  is_enabled         boolean DEFAULT true
  priority           integer DEFAULT 100   -- 同一商材を複数パートナーが扱う場合の優先度
  price_overrides    jsonb                 -- 店舗別の卸値上書き（sku→price）
  created_at / updated_at
  UNIQUE (tenant_id, supply_partner_id)
```

- 紹介エージェント（`agents`）への紐付けとは**完全に独立**したテーブル。
  → 「紹介はA社、仕入はB社」が破綻なく表現できる（決定事項=分離可の担保）。
- RLS: 店舗側は自テナント行のみ。パートナー側は自分が供給先の行を読める。

### 3.5 `purchase_orders` 拡張

```
ALTER TABLE purchase_orders
  ADD COLUMN supply_partner_id   uuid NULL REFERENCES supply_partners(id) ON DELETE SET NULL,
  ADD COLUMN transport           text NULL CHECK (transport IN ('email','api')),
  ADD COLUMN external_order_id   text NULL,     -- 先方が採番した注文番号
  ADD COLUMN transport_status    text NULL,     -- queued/sent/acked/failed
  ADD COLUMN transport_error     text NULL;
```

- `supplier_id`（テナントローカル）と `supply_partner_id`（platform）は**排他的にどちらか**を持つ。

---

## 4. 発注フロー（API化、ただし壁3 維持）

### 4.1 原則 — 「承認は人、搬送だけ自動」

「API自動発注」を**全自動の無人発注**と解釈しない。Ledra の壁3（金額の外向き確定は人）を維持する。
API 化するのは **`sent` 遷移時の搬送（メール→APIコール）だけ**。承認の引き金は人が引く。

```
[AI/cron] inventory.auto_draft_reorder
   → purchase_orders を status=draft で自動起票（既存どおり、無人）
[人] 内容確認 → 承認（approved）→ 発注（sent）   ← ★ここは必ず人（壁3）
[システム] sent 遷移時:
   supply_partner に API 設定あり → placeOrderViaApi()（withRetry 経由）
   なければ                       → sendPurchaseOrderEmail()（既存フォールバック）
[Webhook/ポーリング] 先方の受注確定 → external_order_id / transport_status を更新
[人] 入荷 → received（在庫加算は既存ロジック）
```

### 4.2 API アダプタ

- パートナーごとに API 仕様が違う前提。`SupplyPartnerAdapter` インターフェース
  （`placeOrder(po, items, creds) → { externalOrderId }` / `verifyConnection(creds)`）を定義し、
  汎用 REST アダプタ（`api_config` のフィールドマッピングで吸収）＋個別アダプタを足せる形にする。
- 外向き呼び出しは**必ず `withRetry("supply:<partnerId>", ...)`**（指数バックオフ + circuit breaker）。
- 鍵は実行直前に `readSecret()` で復号。**ログ・レスポンスに鍵を載せない**（logger 自動マスク併用）。

### 4.3 （将来 / 任意）ガード付き自動送信

完全自動の `sent` まで踏み込む場合は壁3 隣接のため**既定禁止**を維持しつつ、opt-in + 強い上限で限定:
`inventory.auto_send_reorder` — 1発注あたり上限額 / 月次上限 / 信頼済みパートナー限定 / 取消窓。
**MVP では対象外**。まずは「人が1タップ承認 → API送信」で運用。

---

## 5. オンボーディング（鶏卵問題への効き方）

供給パートナー本人にデータを入れてもらう動機:

- **同一会社が紹介もやる**場合（決定=分離可だが同一も可）、`agents` のコミッションに加え
  **物販の継続売上**が乗る → 自分から商材・API・連絡先を入れ、紹介した店舗を増やす誘因になる。
- 1回登録すれば、その商材を使う**複数店舗で共有**（各店の二重入力が消える）。

UI（最小）:
1. パートナー招待 → `supply_partners` を `pending` で作成、`owner_user_id` 紐付け
2. パートナーポータル（`/agent` 拡張 or 新設 `/supplier`）で
   **連絡先 → 商材カタログ → API設定** を本人入力（`verifyConnection` で疎通テスト）
3. 店舗側が `tenant_supply_links` で採用 → 在庫品目を `supply_partner_product_id` にマッピング

---

## 6. 6 論点への回答（このドラフトの既定）

| 論点 | 既定方針 |
|---|---|
| ① 紹介元=卸元を同一強制？ | **しない（分離可）**。`supply_partners.agent_id` は任意。店舗別の紐付けは `tenant_supply_links` で独立管理 |
| ② 卸値の店舗別変動 | `tenant_supply_links.price_overrides`（sku→price）で店舗別上書き |
| ③ API鍵はパートナー1本 / 店舗別口座 | **MVP はパートナー1本**（`supply_partners` に集約）。店舗別請求は先方の `external_order_id` に店舗識別を載せて区別。店舗別口座は将来 `tenant_supply_links` 側に鍵を持たせて拡張可 |
| ④ 既存 `suppliers` との共存 | **併存**。テナントローカル仕入先（メール発注）はそのまま。`supply_partner_id` を持つ品目だけ API 経路 |
| ⑤ 契約当事者 | 発注の契約当事者は**店舗↔供給パートナー**。Ledra は SaaS 提供にとどめる（特商法・責任分界を明文化） |
| ⑥ 承認ゲート | API 化しても**送信前の人承認を維持**（壁3）。無人送信は将来の限定 opt-in |

---

## 7. フェーズ別実装計画

```
Phase 0  データモデル + RLS（supply_partners / products / tenant_supply_links /
         inventory_items.supply_partner_product_id / purchase_orders 拡張）
         + 鍵列は secretBox（*_ciphertext）。lint:migrations 準拠の冪等 DDL。

Phase 1  パートナーポータル（連絡先 + 商材カタログ）／店舗側リンク UI／
         在庫品目→カタログのマッピング UI。
         ★API なしでも価値: AI が発注メール下書きを生成（既存 sendPurchaseOrderEmail に接続）。

Phase 2  API 連携本体: SupplyPartnerAdapter / placeOrderViaApi（withRetry）/
         sent 遷移の搬送スイッチ（API or メール）/ verifyConnection /
         受注確定の Webhook 受信 or ポーリングで transport_status 更新。

Phase 3（任意） ガード付き自動送信 inventory.auto_send_reorder（上限額・月次上限・
         信頼済みパートナー限定・取消窓）。壁3 隣接につき既定 OFF・要レビュー。
```

### 着手前に潰すこと

- `agents` テーブルの実カラム（`id` 以外）を確認し、`supply_partners.agent_id` の FK と
  パートナーポータルのロール（`agent_users` 流用可否）を確定する。
- 既存 `suppliers`（テナントローカル）と `supply_partners`（platform）のUI上の見せ方
  （混同しない導線）を決める。

---

## 8. セキュリティ・チェックリスト（README 準拠）

- [ ] API鍵は `secretBox`（`*_ciphertext`）。平文列・ログ・レスポンスに出さない
- [ ] service-role は `createTenantScopedAdmin` 経由。鍵復号→発注はサーバ側のみ。**店舗は鍵を読めない**RLS
- [ ] 外向き API は `withRetry("supply:<id>", ...)`（`npm run audit:retry` 通過）
- [ ] 発注送信（`sent`）の前に人の承認（壁3）。auto は `draft` 起票まで
- [ ] zod 検証（`api_endpoint` は https のみ等）。発注金額・数量の境界チェック
- [ ] migration は `(tenant_id, ...)` 複合 index・冪等 DDL・3段 NOT NULL 化
- [ ] パートナー↔店舗の越境参照（RLS）が漏れていないか（他店の発注・他社の鍵が見えない）
```

---

## 9. 本番有効化（go-live）の状態と手順（2026-06-01 時点）

### 現状
- 本番 `cahybswpduchptvyvdkk` の供給データは **すべて 0 件**（`supply_partners` / `_products` / `tenant_supply_links` / `tenant_supply_auto_send_settings` / `supply_partner_credentials` / マッピング済み `inventory_items`）。
- 代理店アカウント（`agents`/`agent_users`）は 2 件あるが、供給パートナーとしての商材登録・店舗紐付けは未実施。在庫品目も 0 件のため、低在庫トリガー自体が発火しない。
- → 「フラグを立てれば動く」状態ではなく、**データの連鎖（下記手順 ①〜④）を実データで揃えて初めて有効化できる**。

### auto-send は API 連携必須（メールでは自動送信しない）
`decideAutoSend` は `partnerHasApi`（`api_auth_type != 'none'` かつ `api_endpoint` かつ復号済み鍵あり）を要求し、満たさなければ `no_api_transport` で **draft のまま**（人の承認待ち）。メール搬送は手動送信時のフォールバックであり auto-send 経路では使わない。

### DB/MCP からだけでは完全実走できない理由（運用側の操作が必要）
1. **API 鍵は本番 `SECRET_ENCRYPTION_KEY` で暗号化保存**（`supply_partner_credentials.api_key_ciphertext`）。鍵を持たない経路から有効な暗号文は作れず、偽の暗号文では `readSecret` 復号失敗→`hasApi=false`→送信されない。→ 鍵は **アプリ（/agent 連携 UI）経由で登録**する必要がある。
2. **cron 発火に `CRON_SECRET`** が必要（本番アプリ実行時）。
3. 実送信は **本番ランタイムから外部 HTTPS** へ出る（到達可能な相手 API / サンドボックスが要る）。

### 代替: フルパイプラインを実走で検証済み
`src/lib/supply/__tests__/partnerReorder.test.ts` で、低在庫→調達先選定→ドラフト起票→`decideAutoSend`→`placeOrderViaApi` の実 HTTP→`sent` 化までを実コードのまま通し、壁3 ガード（未信頼／未 opt-in／上限超過／API 無し）が正しく弾くことも含めて green。ネットワーク境界（fetch）と DB/秘密/AI ゲートのみモック。

### go-live 手順（runbook）
1. **パートナー**（代理店）が `/agent` でプロフィール・商材カタログ・API 連携（エンドポイント＋鍵）を登録（鍵はアプリが `secretBox` で暗号化）。
2. **運営**が当該 `supply_partners.is_trusted = true` を付与（信頼パートナーのみ auto-send 対象）。
   - `is_trusted` は DB トリガ `supply_partners_guard_protected_cols` で保護されており、**パートナー自身は（アプリ API でも直接 PostgREST でも）変更できない**。設定できるのは service-role（運営/サーバ）のみ。
   - **運営コンソール `/admin/platform/供給パートナー審査` から信頼トグルで付与/解除**できる（`/api/admin/platform/supply-partners`、`isPlatformAdmin` ゲート、service-role 更新、`admin_audit_logs` 記録）。API 連携（active + connected + 鍵）が揃うまで付与ボタンは無効。
   - （SQL で直接付与する場合: `UPDATE supply_partners SET is_trusted = true WHERE id = '<partner_id>';` を service-role 接続で実行。）
3. **店舗**が在庫品目を商材にマッピング（`inventory_items.supply_partner_product_id`）し、`tenant_supply_links` を有効化（優先度・卸値上書き）。
4. **店舗**が `tenant_supply_auto_send_settings` を opt-in（`enabled=true` ＋ `max_order_jpy` ＋ `monthly_cap_jpy` を両方とも正の値で設定）。未設定なら安全側で送らない。
5. 日次の低在庫 cron が下限割れ品目を検知 → パートナー別に発注ドラフトを起票 → 全条件成立時のみ API 自動送信し `sent`（`transport=api` / `external_order_id` 記録）。
6. **安全に試す**: api_endpoint を相手のサンドボックスにし、`max_order_jpy`/`monthly_cap_jpy` を小さく設定、`is_trusted` は運営が明示付与。受注確認は `/api/webhooks/supply/[partnerId]`（HMAC 署名検証）で受ける。
