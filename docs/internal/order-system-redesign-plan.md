# CARTRUST 受発注管理システム再設計 — 実装計画

> 作成: 2026-03-24
> ブランチ: `claude/cartrust-order-system-design-B1lTG`

---

## 0. 既存コードの現状把握

### 既存テーブル（稼働中）

| テーブル | 主要カラム | 備考 |
|---|---|---|
| `job_orders` | `from_tenant_id`, `to_tenant_id`, `title`, `description`, `category`, `budget`, `deadline`, `status` | 受発注の基幹テーブル |
| `documents` | `tenant_id`, `doc_type` (estimate/delivery/purchase_order 等8種), `status` | 帳票管理 |
| `payments` | `document_id`, `customer_id`, `store_id`, `payment_method`, `amount` | 決済記録 |

### 発見された既存バグ（実装前に必ず修正）

**`job_orders` RLSポリシーのカラム名不整合（Critical）**

`20260323020000_rls_role_constraints.sql` 191-194行目が `poster_dealer_id` / `assigned_dealer_id` を参照しているが、テーブル実体は `from_tenant_id` / `to_tenant_id` のまま。RENAMEマイグレーションが存在しない。

この状態では `job_orders` のRLSポリシーが全て壊れており、データが参照できない可能性が高い。

**修正方針**: RLSポリシー側を `from_tenant_id` / `to_tenant_id` に揃える（テーブル実体を変えない）。

---

## 1. 設計方針（レビューを経た決定事項）

### 採用する方針

1. **新テーブル群の大量新設ではなく、既存テーブルの拡張**
   - `job_orders` にカラム追加
   - `documents` に `job_order_id` FK追加
   - `payments` に `job_order_id` FK追加
   - 新設は3テーブルのみ: `chat_messages`, `order_reviews`, `notifications`

2. **強制決済ではなく「取引記録確認制」**
   - 双方が「支払確認ボタン」を押すことで取引完了
   - Stripe Connect決済は任意オプション（使えば便利、使わなくても取引は完了）
   - 理由: 日本B2B取引の月末締め翌月末払い慣行、経理フローの保護、資金決済法リスク回避

3. **評価システムはMVP限定（客観指標 + 5段階評価1項目のみ）**
   - S/A/B/C/Dのランクシステムは月間取引100件超まで凍結
   - 代わりに: 完了率 / 納期遵守率 / 相互5段階評価（1項目）

4. **チャットはジョブ単位（1 `job_order` = 1スレッド）**
   - `chat_threads` テーブル不要、`job_order_id` を直接FKに
   - Supabase Realtime (postgres_changes) でリアルタイム配信

5. **CARTRUSTの差別化: 施工証明書との紐付けを核心に**
   - 受発注 → 帳票 → 施工 → 証明書発行 → 車両履歴、のトレーサビリティチェーン

### 採用しない方針（MVP対象外）

- S/A/B/C/D ランクシステム
- 推奨価格帯・価格誘導機能（独禁法リスク）
- 不正検知 / 共謀検知 / AI審査
- 異議申し立てプロセス
- `order_quotes`（複数業者見積もり比較）
- `order_deliverables`（`documents`テーブルで代替）
- `notification_preferences`（全通知デフォルトON）
- ブラウザプッシュ / モバイルプッシュ

---

## 2. フェーズ別実装計画

### Phase 1: バグ修正 + 受発注強化（優先度: 最高）

**P1-1: RLS不整合の修正**

```sql
-- 新マイグレーション: 20260324000000_fix_job_orders_rls.sql
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_orders') THEN
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_select_v2" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_insert_v2" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_update_v2" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_delete_v2" ON job_orders';
  -- 実在するカラム名に修正
  EXECUTE 'CREATE POLICY "job_orders_select_v3" ON job_orders FOR SELECT USING (from_tenant_id IN (SELECT my_tenant_ids()) OR to_tenant_id IN (SELECT my_tenant_ids()))';
  EXECUTE 'CREATE POLICY "job_orders_insert_v3" ON job_orders FOR INSERT WITH CHECK (from_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(from_tenant_id) IN (''owner'',''admin'',''staff''))';
  EXECUTE 'CREATE POLICY "job_orders_update_v3" ON job_orders FOR UPDATE USING ((from_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(from_tenant_id) IN (''owner'',''admin'',''staff'')) OR (to_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(to_tenant_id) IN (''owner'',''admin'',''staff'')))';
  EXECUTE 'CREATE POLICY "job_orders_delete_v3" ON job_orders FOR DELETE USING (from_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(from_tenant_id) IN (''owner'',''admin''))';
END IF;
END $$;
```

**P1-2: `job_orders` テーブル拡張**

```sql
-- 新マイグレーション: 20260324010000_job_orders_extension.sql
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS order_number        text,
  ADD COLUMN IF NOT EXISTS vehicle_id          uuid REFERENCES vehicles(id),
  ADD COLUMN IF NOT EXISTS accepted_amount     numeric,
  ADD COLUMN IF NOT EXISTS payment_method      text CHECK (payment_method IN ('bank_transfer','cash','card','stripe_connect','other')),
  ADD COLUMN IF NOT EXISTS payment_status      text NOT NULL DEFAULT 'unpaid'
                                               CHECK (payment_status IN ('unpaid','confirmed_by_vendor','confirmed_by_client','both_confirmed')),
  ADD COLUMN IF NOT EXISTS client_approved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by        uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancel_reason       text;

-- ステータスに quoting / payment_pending / approval_pending を追加
ALTER TABLE job_orders
  DROP CONSTRAINT IF EXISTS job_orders_status_check;
ALTER TABLE job_orders
  ADD CONSTRAINT job_orders_status_check
  CHECK (status IN ('pending','quoting','accepted','in_progress','approval_pending','payment_pending','completed','rejected','cancelled'));

-- 連番生成
CREATE SEQUENCE IF NOT EXISTS job_order_seq;
UPDATE job_orders SET order_number = 'ORD-' || to_char(created_at, 'YYYYMM') || '-' || lpad(nextval('job_order_seq')::text, 4, '0') WHERE order_number IS NULL;
ALTER TABLE job_orders ALTER COLUMN order_number SET DEFAULT 'ORD-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('job_order_seq')::text, 4, '0');
```

**P1-3: 既存テーブルへのFK追加**

```sql
-- 新マイグレーション: 20260324020000_link_docs_payments_to_orders.sql
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS job_order_id uuid REFERENCES job_orders(id);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS job_order_id           uuid REFERENCES job_orders(id),
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id      text;

CREATE INDEX IF NOT EXISTS documents_job_order_id_idx ON documents(job_order_id) WHERE job_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_job_order_id_idx  ON payments(job_order_id)  WHERE job_order_id IS NOT NULL;
```

**P1-4: 監査ログテーブル**

```sql
-- 新マイグレーション: 20260324030000_order_audit_log.sql
CREATE TABLE IF NOT EXISTS order_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id   uuid NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  actor_user_id  uuid REFERENCES auth.users(id),
  actor_tenant_id uuid REFERENCES tenants(id),
  action         text NOT NULL,  -- status_changed, amount_set, payment_confirmed, cancelled, etc.
  old_value      jsonb,
  new_value      jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_select" ON order_audit_log FOR SELECT
  USING (job_order_id IN (
    SELECT id FROM job_orders
    WHERE from_tenant_id IN (SELECT my_tenant_ids())
       OR to_tenant_id   IN (SELECT my_tenant_ids())
  ));
-- INSERT はサービスロールのみ（APIルート経由）
```

---

### Phase 2: チャット + 評価（Phase 1完了後）

**P2-1: チャットメッセージテーブル**

```sql
-- 新マイグレーション: 20260324040000_chat_messages.sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id    uuid NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  sender_user_id  uuid NOT NULL REFERENCES auth.users(id),
  sender_tenant_id uuid NOT NULL REFERENCES tenants(id),
  -- 冗長保持（RLS高速化）
  from_tenant_id  uuid NOT NULL,  -- job_orders.from_tenant_id のコピー
  to_tenant_id    uuid NOT NULL,  -- job_orders.to_tenant_id のコピー
  body            text NOT NULL,
  attachment_path text,
  attachment_type text,
  is_system       boolean NOT NULL DEFAULT false,  -- ステータス変更の自動投稿
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_select" ON chat_messages FOR SELECT
  USING (from_tenant_id IN (SELECT my_tenant_ids()) OR to_tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY "chat_messages_insert" ON chat_messages FOR INSERT
  WITH CHECK (
    sender_tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(sender_tenant_id) IN ('owner','admin','staff')
    AND (from_tenant_id IN (SELECT my_tenant_ids()) OR to_tenant_id IN (SELECT my_tenant_ids()))
  );

CREATE INDEX IF NOT EXISTS chat_messages_job_order_id_idx ON chat_messages(job_order_id, created_at);
```

**P2-2: 評価テーブル**

```sql
-- 新マイグレーション: 20260324050000_order_reviews.sql
CREATE TABLE IF NOT EXISTS order_reviews (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id        uuid NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  reviewer_tenant_id  uuid NOT NULL REFERENCES tenants(id),
  reviewed_tenant_id  uuid NOT NULL REFERENCES tenants(id),
  rating              integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment             text,
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  published_at        timestamptz,  -- 双方送信後にセット
  UNIQUE (job_order_id, reviewer_tenant_id)
);

ALTER TABLE order_reviews ENABLE ROW LEVEL SECURITY;

-- 送信者は自分の評価のみSELECT可（未公開時）; 公開後は双方が見れる
CREATE POLICY "order_reviews_select" ON order_reviews FOR SELECT
  USING (
    reviewer_tenant_id IN (SELECT my_tenant_ids())
    OR (published_at IS NOT NULL AND reviewed_tenant_id IN (SELECT my_tenant_ids()))
  );

CREATE POLICY "order_reviews_insert" ON order_reviews FOR INSERT
  WITH CHECK (
    reviewer_tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(reviewer_tenant_id) IN ('owner','admin','staff')
  );
```

**同時公開ロジック**（APIルート内で実装）

```typescript
// 双方が送信済みかチェックし、両方揃ったら published_at をセット
const bothSubmitted = await checkBothReviewsSubmitted(jobOrderId);
if (bothSubmitted) {
  await publishReviews(jobOrderId);  // published_at = now() を両レコードにセット
}
// タイムアウト: 取引完了後14日後にEdge Functionで未回答を自動クローズ
```

---

### Phase 3: 通知 + パートナースコア（Phase 2完了後）

**P3-1: 通知テーブル**

```sql
-- 新マイグレーション: 20260324060000_notifications.sql
CREATE TABLE IF NOT EXISTS notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  user_id         uuid REFERENCES auth.users(id),  -- null = テナント全員
  notification_type text NOT NULL,
  -- order_created, order_accepted, order_completed, order_cancelled,
  -- payment_confirmed, chat_message, rating_request, rating_received
  priority        text NOT NULL DEFAULT 'normal' CHECK (priority IN ('high','normal')),
  title           text NOT NULL,
  body            text,
  link_path       text,  -- /admin/orders/{id} 等
  job_order_id    uuid REFERENCES job_orders(id),
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON notifications FOR SELECT
  USING (tenant_id IN (SELECT my_tenant_ids()) AND (user_id IS NULL OR user_id = auth.uid()));

CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE INDEX IF NOT EXISTS notifications_tenant_id_idx ON notifications(tenant_id, read_at, created_at DESC);
```

**P3-2: パートナースコアビュー（集計ビューのみ、ランクなし）**

```sql
-- 新マイグレーション: 20260324070000_partner_scores.sql
CREATE TABLE IF NOT EXISTS partner_scores (
  tenant_id          uuid PRIMARY KEY REFERENCES tenants(id),
  total_orders       integer NOT NULL DEFAULT 0,
  completed_orders   integer NOT NULL DEFAULT 0,
  on_time_orders     integer NOT NULL DEFAULT 0,
  cancelled_orders   integer NOT NULL DEFAULT 0,
  avg_rating         numeric(3,2),
  rating_count       integer NOT NULL DEFAULT 0,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- 完了率・納期遵守率はビュー/関数で算出
CREATE OR REPLACE VIEW partner_score_view AS
SELECT
  tenant_id,
  total_orders,
  completed_orders,
  CASE WHEN total_orders > 0 THEN round(completed_orders::numeric / total_orders * 100, 1) ELSE NULL END AS completion_rate,
  CASE WHEN completed_orders > 0 THEN round(on_time_orders::numeric / completed_orders * 100, 1) ELSE NULL END AS on_time_rate,
  avg_rating,
  rating_count,
  updated_at
FROM partner_scores;
```

---

## 3. UIの改善計画

### 現状の問題点

`OrdersClient.tsx:261-269` — 発注先テナントIDを手入力させている。ユーザーにUUIDを入力させるUXは論外。

### 改善内容

**発注フォーム**
- テナントID手入力 → テナント名検索（インクリメンタルサーチ）
- `GET /api/admin/tenants/search?q=xxx` でテナント候補を返すAPIを追加

**受発注一覧**
- 発注先/発注元の会社名表示（現在は `to_company` が取れている場合のみ表示）
- 注文番号 (`order_number`) 表示
- 「支払確認」ボタン（取引完了フロー）
- チャット画面への遷移ボタン

**ステータスフロー（UI上の遷移）**

```
pending（申請中）
  → [受注側] accepted（受注）
  → [受注側] in_progress（作業中）
  → [受注側] vendor_completed → approval_pending（検収待ち）
  → [発注側] client_approved → payment_pending（支払待ち）
  → [双方]   payment_confirmed → completed（完了）

pending
  → [受注側] rejected（辞退）
  → [発注側] cancelled（取消）※ accepted まで
```

---

## 4. API設計

### 既存: `GET/POST/PUT /api/admin/orders`
- GETに `from_tenant_id` / `to_tenant_id` でのフィルタ追加
- PUTのステータス変更に監査ログ記録を追加

### 新規追加
| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/admin/orders/[id]` | 単件詳細（チャット、帳票リンク含む）|
| POST | `/api/admin/orders/[id]/confirm-payment` | 支払確認（双方） |
| POST | `/api/admin/orders/[id]/messages` | チャット送信 |
| GET | `/api/admin/orders/[id]/messages` | チャット履歴 |
| POST | `/api/admin/orders/[id]/review` | 評価送信 |
| GET | `/api/admin/tenants/search` | テナント名検索（発注先選択用） |
| GET | `/api/admin/notifications` | 通知一覧 |
| PUT | `/api/admin/notifications/[id]/read` | 既読マーク |

---

## 5. 実装順序サマリー

```
Step 1  RLS修正 (fix_job_orders_rls)             ← バグ修正、最優先
Step 2  job_orders拡張 (job_orders_extension)     ← テーブル拡張
Step 3  FK追加 (link_docs_payments_to_orders)     ← 帳票・決済連携
Step 4  監査ログ (order_audit_log)               ← ステータス変更の追跡
Step 5  OrdersClient UI改善                       ← 発注先検索UI
Step 6  支払確認フローのAPI/UI                   ← 取引記録確認制
Step 7  chat_messages                             ← チャット
Step 8  order_reviews                             ← 評価
Step 9  notifications                             ← 通知
Step 10 partner_scores                            ← スコア集計（後回し可）
```

---

## 6. 絶対に入れないもの（レビュー結論）

| 機能 | 理由 |
|---|---|
| 強制決済 | 日本B2B商慣行破壊、資金決済法リスク、Stripe手数料負担未定 |
| S/A/B/C/Dランク | 母数不足で無意味、関係性破壊リスク、コールドスタート問題 |
| 推奨価格帯 | 独占禁止法（再販売価格拘束）リスク |
| 不正検知/AI審査 | 取引量が月100件超まで不要 |
| DM（取引外チャット） | 外部取引誘導チャネル化リスク、評価基盤の崩壊 |
| order_quotesテーブル | 1対1見積もりはdocumentsテーブルで代替可能 |
| order_deliverablesテーブル | documentsテーブルと完全重複 |

---

## 7. CARTRUSTの唯一の差別化価値

**施工証明書 + 受発注 + 車両履歴のトレーサビリティチェーン**

```
発注作成 → 帳票（見積→発注→検収→請求）→ 施工完了 → 証明書発行 → vehicles.histories に記録
```

他のB2B受発注SaaSにはない唯一の武器。`job_order_id` を `certificates` テーブルにも将来的に追加することで、「この施工はこの受発注に基づき実施された」という法的証跡を構築できる。
