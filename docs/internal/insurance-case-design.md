# CARTRUST 保険案件管理機能 設計書

## 1. 総評

### 要件の本質

この機能は「車両ベースの保険対応ワークフロー」であり、単なるチャット機能ではない。
核心は **「車両を親、案件を単位、メッセージをスレッド」** とする3層構造で、
当事者限定のアクセス制御を RLS レベルで実現することにある。

### なぜ車両直下チャットではなく案件単位スレッドか

| 観点 | 車両直下チャット | 案件単位スレッド（採用） |
|------|-----------------|------------------------|
| 同一車両の複数事故 | 全部混ざる | 案件ごとに分離 |
| 関係者制御 | 全員が全部見える | 案件ごとに参加者限定 |
| ステータス管理 | 車両に1つだけ | 案件ごとに独立 |
| 保険会社の閲覧範囲 | 車両の全履歴が見える | 該当案件に必要な範囲だけ |
| 監査 | どの事故の話か不明 | 案件単位で証跡が残る |
| 将来の第三者参加 | 全員に全部見える | 案件ごとに参加者追加 |

**結論:** 車両直下チャットは権限事故の温床になる。案件単位スレッドが唯一の正解。

### 既存資産との整合

- `vehicles` テーブルが親。`insurance_cases.vehicle_id` で紐付け
- `certificates` は `vehicle_id` で車両に紐付き済み。案件からは「この案件に関連する証明書」をリンクテーブルで参照
- `vehicle_histories` に保険案件イベントも記録可能（type を拡張）
- `insurer_access_logs` は既存のまま活用
- `my_tenant_ids()` ヘルパーは施工店側で引き続き使用
- 保険会社側は **別のヘルパー関数** `my_insurer_id()` を新設

### 既存設計の問題点（設計時に発見）

**`market_inquiry_messages` の RLS が危険:**
```sql
CREATE POLICY "anyone can create messages" ON market_inquiry_messages
  FOR INSERT WITH CHECK (true);
```
これは認証済みユーザーなら誰でもメッセージを挿入できる。保険案件では絶対にこのパターンを使わない。

---

## 2. 推奨アーキテクチャ

### データモデル概要

```
tenants (施工店)
  └── vehicles (車両)
       ├── certificates (施工証明書) ← 既存
       └── insurance_cases (保険案件) ← 新規
            ├── insurance_case_participants (参加者) ← 新規
            ├── insurance_case_messages (メッセージ) ← 新規
            ├── insurance_case_attachments (添付) ← 新規
            ├── insurance_case_certificates (証明書リンク) ← 新規
            └── insurance_case_events (イベントログ) ← 新規

insurers (保険会社) ← 新規（未定義だったものを正式化）
  └── insurer_users (保険会社ユーザー) ← 新規（同上）
```

### アクター定義

| アクター | テーブル | 認証方式 |
|---------|---------|---------|
| 施工店スタッフ | `tenant_memberships` | Supabase Auth + `my_tenant_ids()` |
| 保険会社スタッフ | `insurer_users` | Supabase Auth + `my_insurer_id()` |
| CARTRUST 運営 | `platform_admins`（新規） | Supabase Auth + `is_platform_admin()` |

### ルーティング構造

```
# 施工店側（既存 /admin 配下に追加）
/admin/vehicles/[id]/insurance-cases/new     # 案件起票
/admin/insurance-cases                        # 案件一覧
/admin/insurance-cases/[caseId]              # 案件詳細・スレッド

# 保険会社側（既存 /insurer 配下に追加）
/insurer/cases                                # 案件一覧
/insurer/cases/[caseId]                      # 案件詳細・スレッド
```

---

## 3. DB設計案

### 3-0. 前提テーブル（未定義を正式化）

#### `insurers` — 保険会社マスタ

```sql
CREATE TABLE insurers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  name_kana       text,
  code            text UNIQUE,               -- 保険会社コード（業界標準）
  contact_email   text,
  contact_phone   text,
  address         text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_insurers_code ON insurers(code) WHERE code IS NOT NULL;
CREATE INDEX idx_insurers_active ON insurers(is_active) WHERE is_active = true;
```

**役割:** 保険会社の組織情報。CARTRUST運営が登録・管理する。

#### `insurer_users` — 保険会社ユーザー

```sql
CREATE TABLE insurer_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id      uuid NOT NULL REFERENCES insurers(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member'
                    CHECK (role IN ('admin', 'member')),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (insurer_id, user_id)
);

CREATE INDEX idx_insurer_users_user ON insurer_users(user_id);
CREATE INDEX idx_insurer_users_insurer ON insurer_users(insurer_id);
```

**役割:** 保険会社スタッフとauth.usersの紐付け。`my_insurer_id()` の基盤。

#### `my_insurer_id()` — 保険会社用ヘルパー関数

```sql
CREATE OR REPLACE FUNCTION my_insurer_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT insurer_id
  FROM public.insurer_users
  WHERE user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;
```

**設計判断:** `my_tenant_ids()` が SETOF uuid を返すのに対し、`my_insurer_id()` は単一 uuid を返す。
保険会社ユーザーが複数保険会社に所属するケースは現時点で想定しないため。
将来必要になれば `my_insurer_ids()` (SETOF) に変更可能。

#### `platform_admins` — 運営管理者

```sql
CREATE TABLE platform_admins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  );
$$;
```

**役割:** CARTRUST運営スタッフ。全案件の閲覧・介入が可能。

---

### 3-1. `insurance_cases` — 保険案件

```sql
CREATE TABLE insurance_cases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 親リレーション
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vehicle_id        uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  insurer_id        uuid NOT NULL REFERENCES insurers(id) ON DELETE RESTRICT,

  -- 案件情報
  case_number       text NOT NULL,           -- 表示用案件番号 (例: IC-20260315-001)
  case_type         text NOT NULL
                      CHECK (case_type IN (
                        'accident',          -- 事故入庫
                        'vehicle_insurance', -- 車両保険利用希望
                        'rework_check',      -- 再施工確認
                        'damage_check',      -- 損傷確認
                        'other'              -- その他確認依頼
                      )),
  title             text NOT NULL,           -- 案件タイトル
  description       text,                    -- 案件説明
  damage_summary    text,                    -- 損傷概要
  admitted_at       date,                    -- 入庫日

  -- ステータス
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN (
                        'draft',             -- 下書き
                        'submitted',         -- 提出済み（保険会社へ送信）
                        'under_review',      -- 保険会社確認中
                        'info_requested',    -- 追加情報依頼中
                        'approved',          -- 承認
                        'rejected',          -- 却下
                        'closed',            -- 完了
                        'cancelled'          -- キャンセル
                      )),

  -- メタ
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at      timestamptz,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX idx_ic_case_number ON insurance_cases(case_number);
CREATE INDEX idx_ic_tenant ON insurance_cases(tenant_id);
CREATE INDEX idx_ic_vehicle ON insurance_cases(vehicle_id);
CREATE INDEX idx_ic_insurer ON insurance_cases(insurer_id);
CREATE INDEX idx_ic_status ON insurance_cases(tenant_id, status);
CREATE INDEX idx_ic_insurer_status ON insurance_cases(insurer_id, status);
CREATE INDEX idx_ic_created ON insurance_cases(created_at DESC);
```

**設計判断:**
- `insurer_id` は必須。案件は必ず1つの保険会社に向ける。複数保険会社に同時送信はしない（事故対応の実務に合致）
- `ON DELETE RESTRICT` で保険会社を削除する前に案件の処理が必要
- `case_number` は一意。アプリ層で `IC-{YYYYMMDD}-{連番}` 形式を生成
- `status` は施工店と保険会社の双方が更新するが、遷移ルールはアプリ層で制御

**ステータス遷移図:**
```
draft → submitted → under_review → info_requested → under_review (ループ可)
                                  → approved → closed
                                  → rejected → closed
draft → cancelled
submitted → cancelled（保険会社確認前のみ）
```

---

### 3-2. `insurance_case_participants` — 案件参加者

```sql
CREATE TABLE insurance_case_participants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES insurance_cases(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL
                 CHECK (role IN (
                   'shop_owner',       -- 案件起票者（施工店）
                   'shop_staff',       -- 施工店スタッフ
                   'insurer_reviewer', -- 保険会社担当者
                   'insurer_manager',  -- 保険会社管理者
                   'third_party',      -- 将来: 鈑金工場等
                   'platform_admin'    -- 運営管理者
                 )),
  added_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, user_id)
);

CREATE INDEX idx_icp_case ON insurance_case_participants(case_id);
CREATE INDEX idx_icp_user ON insurance_case_participants(user_id);
CREATE INDEX idx_icp_active ON insurance_case_participants(case_id, is_active)
  WHERE is_active = true;
```

**役割:** RLS の核心。このテーブルにレコードがある user_id だけが案件を閲覧・操作できる。

**設計判断:**
- UNIQUE(case_id, user_id) で同一ユーザーの重複参加を防止
- `is_active = false` で参加を無効化（削除ではなく論理無効化。履歴保持のため）
- `added_by` で誰が追加したか追跡
- 案件起票時に自動的に起票者 + 保険会社デフォルト担当者を登録

---

### 3-3. `insurance_case_messages` — 案件メッセージ

```sql
CREATE TABLE insurance_case_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL REFERENCES insurance_cases(id) ON DELETE CASCADE,
  sender_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  visibility    text NOT NULL DEFAULT 'shared'
                  CHECK (visibility IN (
                    'shared',       -- 外部共有（保険会社にも見える）
                    'internal'      -- 内部メモ（施工店内のみ）
                  )),
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_icm_case ON insurance_case_messages(case_id, created_at);
CREATE INDEX idx_icm_sender ON insurance_case_messages(sender_id);
CREATE INDEX idx_icm_visibility ON insurance_case_messages(case_id, visibility);
```

**設計判断:**
- `visibility` で内部メモと外部共有を **テーブルレベルで分離**
- `internal` メッセージは保険会社の RLS で完全に除外される（UI非表示だけでなくDB層で遮断）
- メッセージの編集は `updated_at` で追跡。削除は論理削除ではなく **禁止**（証跡保持）
- 将来の既読管理は別テーブル `insurance_case_read_receipts` で対応可能

**なぜ internal_notes を別テーブルにしないか:**
別テーブルにすると、施工店側UIで「時系列で混ぜて表示」が面倒になる。
同一テーブルに `visibility` カラムを持ち、RLS で保険会社には `visibility = 'shared'` のみ見せる方が
実装もクエリも単純。かつ RLS で確実に遮断されるため安全。

---

### 3-4. `insurance_case_attachments` — 案件添付ファイル

```sql
CREATE TABLE insurance_case_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES insurance_cases(id) ON DELETE CASCADE,
  message_id      uuid REFERENCES insurance_case_messages(id) ON DELETE SET NULL,
  uploaded_by     uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_path    text NOT NULL,
  file_name       text NOT NULL,
  content_type    text,
  file_size       bigint DEFAULT 0,
  visibility      text NOT NULL DEFAULT 'shared'
                    CHECK (visibility IN ('shared', 'internal')),
  category        text NOT NULL DEFAULT 'other'
                    CHECK (category IN (
                      'damage_photo',      -- 損傷写真
                      'estimate',          -- 見積書
                      'certificate',       -- 証明書コピー
                      'inspection_report', -- 点検報告書
                      'invoice',           -- 請求書
                      'other'              -- その他
                    )),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ica_case ON insurance_case_attachments(case_id);
CREATE INDEX idx_ica_message ON insurance_case_attachments(message_id)
  WHERE message_id IS NOT NULL;
CREATE INDEX idx_ica_visibility ON insurance_case_attachments(case_id, visibility);
```

**設計判断:**
- `message_id` は任意。メッセージに紐付かない添付（案件レベルの資料）も許容
- `visibility` はメッセージと同じ仕組み。内部添付は保険会社に見せない
- `storage_path` は Supabase Storage の `insurance-cases` バケットを使用
- ファイルサイズ制限はアプリ層で制御（MVP: 10MB/ファイル、合計100MB/案件）

**Storage バケット設計:**
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('insurance-cases', 'insurance-cases', false)
ON CONFLICT DO NOTHING;
```
**`public = false`** が重要。Signed URL 経由でのみアクセス可能にする。

---

### 3-5. `insurance_case_certificates` — 案件・証明書リンク

```sql
CREATE TABLE insurance_case_certificates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES insurance_cases(id) ON DELETE CASCADE,
  certificate_id  uuid NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  linked_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note            text,            -- リンク理由メモ
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, certificate_id)
);

CREATE INDEX idx_icc_case ON insurance_case_certificates(case_id);
CREATE INDEX idx_icc_cert ON insurance_case_certificates(certificate_id);
```

**役割:** 案件に関連する施工証明書をリンクする中間テーブル。

**設計判断:**
- 車両に紐づく全証明書を自動的に見せるのではなく、**施工店が明示的にリンクした証明書だけ** を保険会社に公開する
- これにより「この案件に必要な施工履歴だけ」に閲覧範囲を絞れる
- 保険会社が車両の全施工履歴を見ることを防ぐ **情報最小化原則**

**なぜ自動リンクではなく手動リンクか:**
自動リンク（vehicle_id で全証明書を引く）だと、案件に無関係な施工履歴まで保険会社に露出する。
例: 事故案件で入庫したが、同じ車両に過去のカスタム施工の証明書がある場合、
それは保険会社に見せるべきではない。施工店が意図的に選んでリンクする方が安全。

---

### 3-6. `insurance_case_events` — 案件イベントログ

```sql
CREATE TABLE insurance_case_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL REFERENCES insurance_cases(id) ON DELETE CASCADE,
  actor_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type    text NOT NULL
                  CHECK (event_type IN (
                    'created',             -- 案件作成
                    'submitted',           -- 提出
                    'status_changed',      -- ステータス変更
                    'message_sent',        -- メッセージ送信
                    'attachment_uploaded',  -- 添付アップロード
                    'certificate_linked',  -- 証明書リンク
                    'participant_added',   -- 参加者追加
                    'participant_removed', -- 参加者削除
                    'viewed'               -- 閲覧
                  )),
  detail        jsonb DEFAULT '{}'::jsonb, -- { from: "submitted", to: "under_review" } など
  ip            text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ice_case ON insurance_case_events(case_id, created_at);
CREATE INDEX idx_ice_type ON insurance_case_events(event_type);
CREATE INDEX idx_ice_actor ON insurance_case_events(actor_id);
```

**設計判断:**
- `vehicle_histories` とは別テーブル。車両ライフサイクルのログと案件ライフサイクルのログは分離
- ただし案件作成・完了時には `vehicle_histories` にも記録する（車両タイムラインに表示するため）
- `detail` は jsonb で柔軟に。ステータス変更時は `{ "from": "submitted", "to": "under_review" }`
- append-only。UPDATE / DELETE 不可（RLS で制御）

---

### 3-7. ER図（テキスト）

```
tenants ──1:N──> vehicles ──1:N──> insurance_cases ──1:N──> insurance_case_messages
   │                │                    │                        │
   │                │                    ├──1:N──> insurance_case_attachments
   │                │                    │
   │                │                    ├──1:N──> insurance_case_participants
   │                │                    │
   │                │                    ├──1:N──> insurance_case_certificates ──N:1──> certificates
   │                │                    │
   │                │                    └──1:N──> insurance_case_events
   │                │
   │                └──1:N──> certificates (既存)
   │
   └──1:N──> tenant_memberships ──N:1──> auth.users

insurers ──1:N──> insurer_users ──N:1──> auth.users
   │
   └──1:N──> insurance_cases (insurer_id)
```

---

## 4. 権限設計案

### 4-1. ロール別権限マトリクス

#### 施工店 (`shop_owner` / `shop_staff`)

| 対象 | 操作 | 条件 |
|------|------|------|
| insurance_cases | SELECT | `tenant_id IN my_tenant_ids()` |
| insurance_cases | INSERT | `tenant_id IN my_tenant_ids()` |
| insurance_cases | UPDATE (status) | `tenant_id IN my_tenant_ids()` かつ遷移ルールに従う |
| insurance_case_messages | SELECT | 参加者 かつ `visibility IN ('shared', 'internal')` |
| insurance_case_messages | INSERT | 参加者 |
| insurance_case_attachments | SELECT | 参加者 かつ `visibility IN ('shared', 'internal')` |
| insurance_case_attachments | INSERT | 参加者 |
| insurance_case_certificates | SELECT | 参加者 |
| insurance_case_certificates | INSERT | `tenant_id IN my_tenant_ids()` |
| insurance_case_participants | SELECT | 参加者 |
| insurance_case_events | SELECT | 参加者 |
| insurance_case_events | INSERT | 参加者（自動記録） |

#### 保険会社 (`insurer_reviewer` / `insurer_manager`)

| 対象 | 操作 | 条件 |
|------|------|------|
| insurance_cases | SELECT | `insurer_id = my_insurer_id()` |
| insurance_cases | UPDATE (status) | `insurer_id = my_insurer_id()` かつ遷移ルールに従う |
| insurance_case_messages | SELECT | 参加者 かつ **`visibility = 'shared'` のみ** |
| insurance_case_messages | INSERT | 参加者（自動的に `visibility = 'shared'`） |
| insurance_case_attachments | SELECT | 参加者 かつ **`visibility = 'shared'` のみ** |
| insurance_case_attachments | INSERT | 参加者 |
| insurance_case_certificates | SELECT | 参加者（リンクされた証明書のみ） |
| insurance_case_participants | SELECT | 参加者 |
| insurance_case_events | SELECT | 参加者 |

**重要: 保険会社が見えないもの:**
- `visibility = 'internal'` のメッセージ・添付
- 案件にリンクされていない証明書
- 車両の全施工履歴
- 他の保険会社向けの案件
- 施工店の顧客情報（customer_email, customer_phone_masked は案件経由では露出しない）

#### 運営管理者 (`platform_admin`)

| 対象 | 操作 | 条件 |
|------|------|------|
| 全テーブル | SELECT | `is_platform_admin() = true` |
| insurance_cases | UPDATE | `is_platform_admin() = true`（エスカレーション対応） |
| insurance_case_messages | INSERT | `is_platform_admin() = true`（介入メッセージ） |

#### 将来の第三者参加者 (`third_party`)

- `insurance_case_participants` にレコード追加で参加
- `visibility = 'shared'` のメッセージ・添付のみ閲覧可能（保険会社と同じ）
- 自身のメッセージ・添付の追加が可能
- ステータス変更は不可

---

### 4-2. RLS ポリシー

#### `insurance_cases` の RLS

```sql
ALTER TABLE insurance_cases ENABLE ROW LEVEL SECURITY;

-- 施工店: 自テナントの案件を閲覧
CREATE POLICY "ic_shop_select" ON insurance_cases
  FOR SELECT USING (
    tenant_id IN (SELECT my_tenant_ids())
  );

-- 保険会社: 自社宛の案件を閲覧（draft は除外）
CREATE POLICY "ic_insurer_select" ON insurance_cases
  FOR SELECT USING (
    insurer_id = my_insurer_id()
    AND status != 'draft'
  );

-- 運営: 全案件閲覧
CREATE POLICY "ic_admin_select" ON insurance_cases
  FOR SELECT USING (
    is_platform_admin()
  );

-- 施工店: 案件作成
CREATE POLICY "ic_shop_insert" ON insurance_cases
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
  );

-- 施工店: 自テナントの案件を更新
CREATE POLICY "ic_shop_update" ON insurance_cases
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
  );

-- 保険会社: 自社宛の案件ステータスを更新
CREATE POLICY "ic_insurer_update" ON insurance_cases
  FOR UPDATE USING (
    insurer_id = my_insurer_id()
    AND status != 'draft'
  );

-- 運営: 全案件更新
CREATE POLICY "ic_admin_update" ON insurance_cases
  FOR UPDATE USING (
    is_platform_admin()
  );
```

#### `insurance_case_messages` の RLS

```sql
ALTER TABLE insurance_case_messages ENABLE ROW LEVEL SECURITY;

-- 参加者ヘルパー関数
CREATE OR REPLACE FUNCTION is_case_participant(p_case_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.insurance_case_participants
    WHERE case_id = p_case_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

-- 保険会社ユーザーかどうか判定
CREATE OR REPLACE FUNCTION is_insurer_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.insurer_users
    WHERE user_id = auth.uid()
      AND is_active = true
  );
$$;

-- 施工店参加者: shared + internal 両方見える
CREATE POLICY "icm_shop_select" ON insurance_case_messages
  FOR SELECT USING (
    is_case_participant(case_id)
    AND NOT is_insurer_user()
  );

-- 保険会社参加者: shared のみ見える
CREATE POLICY "icm_insurer_select" ON insurance_case_messages
  FOR SELECT USING (
    is_case_participant(case_id)
    AND is_insurer_user()
    AND visibility = 'shared'
  );

-- 運営: 全メッセージ閲覧
CREATE POLICY "icm_admin_select" ON insurance_case_messages
  FOR SELECT USING (
    is_platform_admin()
  );

-- 参加者: メッセージ送信（sender_id = 自分のみ）
CREATE POLICY "icm_insert" ON insurance_case_messages
  FOR INSERT WITH CHECK (
    is_case_participant(case_id)
    AND sender_id = auth.uid()
  );

-- 運営: メッセージ送信
CREATE POLICY "icm_admin_insert" ON insurance_case_messages
  FOR INSERT WITH CHECK (
    is_platform_admin()
  );
```

**セキュリティ上の重要ポイント:**

保険会社ユーザーが `visibility = 'internal'` でメッセージを送信することを **アプリ層で防止** する。
RLS だけでは INSERT 時の visibility 値を制御できないため、API Route で以下を強制:

```typescript
// src/app/api/insurance-cases/[caseId]/messages/route.ts
if (isInsurerUser) {
  // 保険会社ユーザーは常に shared
  visibility = 'shared';
}
```

さらに安全のため、DB トリガーでも強制:

```sql
CREATE OR REPLACE FUNCTION enforce_insurer_message_visibility()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.insurer_users
    WHERE user_id = NEW.sender_id AND is_active = true
  ) THEN
    NEW.visibility := 'shared';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_insurer_visibility
  BEFORE INSERT ON insurance_case_messages
  FOR EACH ROW EXECUTE FUNCTION enforce_insurer_message_visibility();
```

#### `insurance_case_attachments` の RLS

```sql
ALTER TABLE insurance_case_attachments ENABLE ROW LEVEL SECURITY;

-- 施工店参加者: shared + internal 両方
CREATE POLICY "ica_shop_select" ON insurance_case_attachments
  FOR SELECT USING (
    is_case_participant(case_id)
    AND NOT is_insurer_user()
  );

-- 保険会社参加者: shared のみ
CREATE POLICY "ica_insurer_select" ON insurance_case_attachments
  FOR SELECT USING (
    is_case_participant(case_id)
    AND is_insurer_user()
    AND visibility = 'shared'
  );

-- 運営: 全添付閲覧
CREATE POLICY "ica_admin_select" ON insurance_case_attachments
  FOR SELECT USING (
    is_platform_admin()
  );

-- 参加者: アップロード
CREATE POLICY "ica_insert" ON insurance_case_attachments
  FOR INSERT WITH CHECK (
    is_case_participant(case_id)
    AND uploaded_by = auth.uid()
  );

-- 運営: アップロード
CREATE POLICY "ica_admin_insert" ON insurance_case_attachments
  FOR INSERT WITH CHECK (
    is_platform_admin()
  );
```

#### `insurance_case_participants` の RLS

```sql
ALTER TABLE insurance_case_participants ENABLE ROW LEVEL SECURITY;

-- 案件参加者: 参加者リストを閲覧
CREATE POLICY "icp_select" ON insurance_case_participants
  FOR SELECT USING (
    is_case_participant(case_id)
    OR is_platform_admin()
  );

-- 施工店: 参加者追加（自テナントの案件のみ）
CREATE POLICY "icp_shop_insert" ON insurance_case_participants
  FOR INSERT WITH CHECK (
    case_id IN (
      SELECT id FROM insurance_cases
      WHERE tenant_id IN (SELECT my_tenant_ids())
    )
  );

-- 運営: 参加者追加
CREATE POLICY "icp_admin_insert" ON insurance_case_participants
  FOR INSERT WITH CHECK (
    is_platform_admin()
  );

-- 施工店: 参加者の is_active 更新
CREATE POLICY "icp_shop_update" ON insurance_case_participants
  FOR UPDATE USING (
    case_id IN (
      SELECT id FROM insurance_cases
      WHERE tenant_id IN (SELECT my_tenant_ids())
    )
  );
```

#### `insurance_case_certificates` の RLS

```sql
ALTER TABLE insurance_case_certificates ENABLE ROW LEVEL SECURITY;

-- 参加者: リンク済み証明書を閲覧
CREATE POLICY "icc_select" ON insurance_case_certificates
  FOR SELECT USING (
    is_case_participant(case_id)
    OR is_platform_admin()
  );

-- 施工店: 証明書リンク追加
CREATE POLICY "icc_shop_insert" ON insurance_case_certificates
  FOR INSERT WITH CHECK (
    case_id IN (
      SELECT id FROM insurance_cases
      WHERE tenant_id IN (SELECT my_tenant_ids())
    )
  );
```

**保険会社が証明書の中身を見るための追加 RLS:**

既存の `certificates` テーブルに保険会社向けの SELECT ポリシーを追加:

```sql
-- 保険会社: 案件にリンクされた証明書のみ閲覧可能
CREATE POLICY "certs_insurer_select" ON certificates
  FOR SELECT USING (
    id IN (
      SELECT certificate_id FROM insurance_case_certificates icc
      JOIN insurance_cases ic ON ic.id = icc.case_id
      WHERE ic.insurer_id = my_insurer_id()
        AND ic.status != 'draft'
    )
  );

-- 同様に certificate_images にも
CREATE POLICY "certimg_insurer_select" ON certificate_images
  FOR SELECT USING (
    certificate_id IN (
      SELECT certificate_id FROM insurance_case_certificates icc
      JOIN insurance_cases ic ON ic.id = icc.case_id
      WHERE ic.insurer_id = my_insurer_id()
        AND ic.status != 'draft'
    )
  );
```

#### `insurance_case_events` の RLS

```sql
ALTER TABLE insurance_case_events ENABLE ROW LEVEL SECURITY;

-- 参加者: イベントログ閲覧
CREATE POLICY "ice_select" ON insurance_case_events
  FOR SELECT USING (
    is_case_participant(case_id)
    OR is_platform_admin()
  );

-- サービスロール経由での INSERT のみ（アプリ層から admin client で記録）
-- ユーザーが直接 INSERT しない
CREATE POLICY "ice_service_insert" ON insurance_case_events
  FOR INSERT WITH CHECK (false);
  -- service_role は RLS をバイパスするため、これで一般ユーザーの直接 INSERT を防止
```

#### Storage ポリシー

```sql
-- insurance-cases バケットのストレージポリシー
CREATE POLICY "ic_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'insurance-cases'
    AND auth.uid() IS NOT NULL
    -- 実際のアクセス制御は Signed URL + insurance_case_attachments の RLS で行う
  );

CREATE POLICY "ic_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'insurance-cases'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "ic_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'insurance-cases'
    AND auth.uid() IS NOT NULL
    -- 削除は API Route 経由でのみ。直接削除を防ぐため、
    -- API Route で参加者・アップロード者チェックを行う
  );
```

**Storage アクセス制御の設計:**

Storage 直接アクセスではなく **Signed URL パターン** を採用:

1. クライアントが API Route に添付ファイルリクエスト
2. API Route で参加者チェック + visibility チェック
3. 通過したら Signed URL (有効期限: 5分) を返却
4. クライアントは Signed URL で直接ダウンロード

```typescript
// src/app/api/insurance-cases/[caseId]/attachments/[attachmentId]/url/route.ts
export async function GET(req: Request, { params }) {
  const { caseId, attachmentId } = params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 参加者チェック（RLS が効くので、取得できれば参加者）
  const { data: attachment } = await supabase
    .from('insurance_case_attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .eq('case_id', caseId)
    .single();

  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const admin = createAdminClient();
  const { data } = await admin.storage
    .from('insurance-cases')
    .createSignedUrl(attachment.storage_path, 300); // 5分

  return NextResponse.json({ url: data.signedUrl });
}
```

---

## 5. 画面設計案

### 5-1. 車両詳細ページ内「保険案件を起票」

**パス:** `/admin/vehicles/[id]` （既存ページに「保険案件」タブまたはセクション追加）

| 項目 | 内容 |
|------|------|
| 使用者 | 施工店スタッフ |
| 表示内容 | 車両情報（既存）+ この車両の案件一覧 + 「保険案件を起票」ボタン |
| 編集可能 | 起票ボタン押下 → 新規作成フォーム |
| 非表示 | 保険会社には見えない画面 |

**起票フォーム（モーダルまたは `/admin/vehicles/[id]/insurance-cases/new`）:**

```
案件種別:     [セレクト: 事故入庫 / 車両保険利用希望 / 再施工確認 / 損傷確認 / その他]
タイトル:     [テキスト入力]
保険会社:     [セレクト: 登録済み保険会社一覧]
入庫日:       [日付ピッカー]
損傷概要:     [テキストエリア]
説明:         [テキストエリア]
添付資料:     [ファイルアップロード（複数可）]
関連証明書:   [この車両の証明書一覧からチェックボックスで選択]
```

**起票時の自動処理:**
1. `insurance_cases` にレコード作成（status = 'draft'）
2. `insurance_case_participants` に起票者を `shop_owner` で追加
3. 同テナントの他スタッフは案件一覧で見えるが、participant に自動追加はしない（任意追加）
4. 「提出」ボタンで status → `submitted` に遷移。この時点で保険会社に通知

---

### 5-2. 案件一覧

**パス（施工店）:** `/admin/insurance-cases`
**パス（保険会社）:** `/insurer/cases`

#### 施工店側

| 項目 | 内容 |
|------|------|
| 使用者 | 施工店スタッフ |
| 表示内容 | 案件番号、車両情報（車名・ナンバー）、案件種別、保険会社名、ステータス、作成日、最終更新日 |
| フィルタ | ステータス、案件種別、保険会社、期間 |
| 編集可能 | なし（一覧からは詳細へ遷移） |
| 非表示 | 他テナントの案件 |

#### 保険会社側

| 項目 | 内容 |
|------|------|
| 使用者 | 保険会社スタッフ |
| 表示内容 | 案件番号、車両情報（車名・ナンバー）、案件種別、施工店名、ステータス、提出日 |
| フィルタ | ステータス、案件種別、期間 |
| 編集可能 | なし |
| 非表示 | draft 状態の案件、顧客の個人連絡先、他保険会社の案件 |

---

### 5-3. 案件詳細

**パス（施工店）:** `/admin/insurance-cases/[caseId]`
**パス（保険会社）:** `/insurer/cases/[caseId]`

#### レイアウト構成

```
┌─────────────────────────────────────────────────────┐
│ ヘッダー: 案件番号 / タイトル / ステータスバッジ      │
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│  メインエリア         │  サイドバー                   │
│                      │                              │
│  ┌─ タブ ──────────┐ │  車両情報サマリ               │
│  │ スレッド │ 添付  │ │  案件情報                     │
│  │ 証明書  │ 履歴  │ │  参加者一覧                   │
│  └─────────────────┘ │  ステータス変更ボタン          │
│                      │                              │
│  [選択中タブの内容]    │                              │
│                      │                              │
└──────────────────────┴──────────────────────────────┘
```

#### スレッドタブ

| 項目 | 施工店 | 保険会社 |
|------|--------|---------|
| shared メッセージ | 表示 | 表示 |
| internal メッセージ | 表示（背景色を変えて区別） | **非表示（RLS で遮断）** |
| メッセージ入力 | shared / internal 切り替え可 | shared のみ（切り替えUI なし） |
| 送信者名 | 表示 | 表示 |
| タイムスタンプ | 表示 | 表示 |

#### 添付タブ

| 項目 | 施工店 | 保険会社 |
|------|--------|---------|
| shared 添付 | 表示 | 表示 |
| internal 添付 | 表示（ラベル付き） | **非表示** |
| アップロード | 可能（visibility 選択可） | 可能（常に shared） |
| ダウンロード | Signed URL 経由 | Signed URL 経由 |

#### 証明書タブ

| 項目 | 施工店 | 保険会社 |
|------|--------|---------|
| リンク済み証明書一覧 | 表示 + リンク追加/解除 | 表示のみ |
| 証明書詳細への遷移 | /admin/certificates/[publicId] | /insurer/c/[publicId]（既存） |
| 未リンクの証明書 | 追加候補として表示 | **非表示** |

#### 履歴タブ

| 項目 | 施工店 | 保険会社 |
|------|--------|---------|
| イベントログ | 全イベント | 全イベント |
| タイムライン表示 | 時系列 | 時系列 |

#### サイドバー

| 項目 | 施工店 | 保険会社 |
|------|--------|---------|
| 車両情報 | 車名、ナンバー、年式 | 車名、ナンバー、年式 |
| 顧客名 | 表示 | 表示 |
| 顧客連絡先 | 表示 | **非表示** |
| 案件種別 | 表示 | 表示 |
| 入庫日 | 表示 | 表示 |
| 参加者 | 全員表示 | 全員表示 |
| ステータス変更 | ボタン表示 | ボタン表示 |

#### ステータス変更UI

施工店が変更可能:
- `draft` → `submitted`（「提出する」ボタン）
- `submitted` → `cancelled`（「取り消す」ボタン。保険会社確認前のみ）
- `info_requested` → `submitted`（追加情報を送って再提出）
- `approved` / `rejected` → `closed`（「案件を完了する」ボタン）

保険会社が変更可能:
- `submitted` → `under_review`（「確認を開始」ボタン）
- `under_review` → `info_requested`（「追加情報を依頼」ボタン）
- `under_review` → `approved`（「承認」ボタン）
- `under_review` → `rejected`（「却下」ボタン + 理由入力）

---

### 5-4. 通知

MVP ではメール通知のみ（Resend 経由）:

| トリガー | 通知先 | 内容 |
|---------|--------|------|
| 案件提出 (submitted) | 保険会社 | 「新しい保険案件が提出されました」 |
| ステータス変更 | 変更した側の相手方 | 「案件のステータスが変更されました」 |
| 追加情報依頼 (info_requested) | 施工店 | 「保険会社から追加情報が依頼されています」 |
| メッセージ送信 (shared) | 相手方の参加者 | 「新しいメッセージがあります」 |
| 承認/却下 | 施工店 | 「案件が承認/却下されました」 |

---

## 6. MVP 最小構成

### 含めるもの

| 項目 | MVP 仕様 |
|------|---------|
| テーブル | insurance_cases, insurance_case_participants, insurance_case_messages, insurance_case_attachments, insurance_case_certificates, insurance_case_events |
| 前提テーブル | insurers, insurer_users, platform_admins |
| リアルタイム | **不要**。ページリロードまたはポーリング（30秒間隔）で十分 |
| 通知 | メール通知のみ（Resend）。プッシュ通知・アプリ内通知は Phase 2 |
| 参加者管理 | 起票時に自動で起票者 + 保険会社全ユーザーを追加。手動追加は Phase 2 |
| 添付 | カテゴリ分類あり。ファイルサイズ制限 10MB/ファイル |
| 内部メモ | あり（visibility = 'internal'）。MVP から含める（後付けは困難） |
| ステータス | 全8ステータス実装。遷移ルールはアプリ層で制御 |
| 案件種別 | 5種（accident, vehicle_insurance, rework_check, damage_check, other） |
| 証明書リンク | 手動リンクのみ。起票時に選択 + 後から追加可能 |
| 既読管理 | **不要**。Phase 2 |
| テンプレ返信 | **不要**。Phase 2 |
| 運営管理画面 | **不要**。Phase 2。運営は Supabase ダッシュボードで対応 |

### 含めないもの（Phase 2 以降）

- Supabase Realtime（リアルタイム更新）
- アプリ内通知 / 未読バッジ
- 手動参加者追加・削除
- 第三者（鈑金工場）参加
- SLA管理
- テンプレ返信
- 既読管理
- 承認フロー（複数承認者）
- 外部API連携
- 運営管理画面

### MVP 画面一覧

| # | パス | 新規/既存拡張 |
|---|------|-------------|
| 1 | `/admin/vehicles/[id]` | 既存拡張（保険案件セクション追加） |
| 2 | `/admin/vehicles/[id]/insurance-cases/new` | 新規 |
| 3 | `/admin/insurance-cases` | 新規 |
| 4 | `/admin/insurance-cases/[caseId]` | 新規 |
| 5 | `/insurer/cases` | 新規 |
| 6 | `/insurer/cases/[caseId]` | 新規 |

### MVP API Route 一覧

| # | パス | メソッド | 用途 |
|---|------|---------|------|
| 1 | `/api/insurance-cases` | GET | 案件一覧取得 |
| 2 | `/api/insurance-cases` | POST | 案件作成 |
| 3 | `/api/insurance-cases/[caseId]` | GET | 案件詳細取得 |
| 4 | `/api/insurance-cases/[caseId]` | PATCH | 案件更新（ステータス変更含む） |
| 5 | `/api/insurance-cases/[caseId]/messages` | GET | メッセージ一覧 |
| 6 | `/api/insurance-cases/[caseId]/messages` | POST | メッセージ送信 |
| 7 | `/api/insurance-cases/[caseId]/attachments` | GET | 添付一覧 |
| 8 | `/api/insurance-cases/[caseId]/attachments` | POST | 添付アップロード |
| 9 | `/api/insurance-cases/[caseId]/attachments/[id]/url` | GET | Signed URL 取得 |
| 10 | `/api/insurance-cases/[caseId]/certificates` | GET | リンク済み証明書 |
| 11 | `/api/insurance-cases/[caseId]/certificates` | POST | 証明書リンク追加 |
| 12 | `/api/insurance-cases/[caseId]/certificates/[id]` | DELETE | 証明書リンク解除 |
| 13 | `/api/insurance-cases/[caseId]/events` | GET | イベントログ |

---

## 7. 将来拡張

### Phase 2 候補

| 機能 | 概要 | 影響範囲 |
|------|------|---------|
| Realtime 更新 | Supabase Realtime でメッセージ・ステータスを即時反映 | フロントエンドのみ |
| アプリ内通知 | `notifications` テーブル + 未読バッジ | 新テーブル + UI |
| 既読管理 | `insurance_case_read_receipts` テーブル | 新テーブル |
| 手動参加者管理 | 施工店が参加者を追加・削除するUI | UI のみ |
| テンプレ返信 | よく使う返信テンプレート | `insurance_case_reply_templates` テーブル |
| 運営管理画面 | `/admin/platform/cases` で全案件を管理 | 新ページ |

### Phase 3 候補

| 機能 | 概要 | 影響範囲 |
|------|------|---------|
| 鈑金工場参加 | `third_party` ロールの実運用 | 新テナント種別 or 外部ユーザー |
| SLA管理 | 応答期限・エスカレーション | `insurance_case_sla` テーブル + cron |
| 承認フロー | 複数承認者・段階的承認 | `insurance_case_approvals` テーブル |
| 案件種別拡張 | CHECK 制約を外してマスタテーブル化 | `insurance_case_types` テーブル |
| 外部API連携 | 保険会社基幹システム連携 | Webhook / API |
| コメント内部/外部切り替え | 送信後に visibility を変更 | アプリ層 + 監査ログ |
| PDF レポート | 案件の全体サマリPDF | PDF生成 |
| 案件テンプレート | 案件種別ごとのフォームテンプレート | `insurance_case_form_templates` |

### 拡張時の設計上の注意

- `insurance_case_participants.role` の CHECK 制約に新ロールを追加する場合は ALTER TABLE が必要。将来的にはマスタテーブル化を検討
- `case_type` も同様。初期は CHECK 制約で十分だが、Phase 3 でマスタテーブル化
- Realtime は `insurance_case_messages` テーブルに対して Supabase の `REPLICA IDENTITY FULL` を設定する必要がある
- 通知テーブルを追加する際は、既存の `vehicle_histories` と `insurance_case_events` との棲み分けを明確にする

---

## 8. 実装フェーズ分割

### Phase 1: 基盤 + 最小フロー（MVP）

**期間目安: 2-3 スプリント**

```
Step 1: DB マイグレーション
  - insurers, insurer_users, platform_admins テーブル作成
  - my_insurer_id(), is_platform_admin(), is_case_participant() 関数作成
  - insurance_cases テーブル + RLS
  - insurance_case_participants テーブル + RLS
  - insurance_case_messages テーブル + RLS + visibility トリガー
  - insurance_case_attachments テーブル + RLS
  - insurance_case_certificates テーブル + RLS
  - insurance_case_events テーブル + RLS
  - certificates への保険会社向け SELECT ポリシー追加
  - insurance-cases Storage バケット + ポリシー
  - case_number 生成用シーケンスまたは関数

Step 2: 型定義
  - src/types/insurance-case.ts

Step 3: API Routes（施工店側）
  - /api/insurance-cases (GET, POST)
  - /api/insurance-cases/[caseId] (GET, PATCH)
  - /api/insurance-cases/[caseId]/messages (GET, POST)
  - /api/insurance-cases/[caseId]/attachments (GET, POST)
  - /api/insurance-cases/[caseId]/attachments/[id]/url (GET)
  - /api/insurance-cases/[caseId]/certificates (GET, POST, DELETE)
  - /api/insurance-cases/[caseId]/events (GET)

Step 4: API Routes（保険会社側）
  - 同じ API Routes を共用（RLS で制御）。ただし一部ロジックを分岐

Step 5: 施工店UI
  - /admin/vehicles/[id] に保険案件セクション追加
  - /admin/vehicles/[id]/insurance-cases/new（起票フォーム）
  - /admin/insurance-cases（一覧）
  - /admin/insurance-cases/[caseId]（詳細・スレッド・添付・証明書・履歴）

Step 6: 保険会社UI
  - /insurer/cases（一覧）
  - /insurer/cases/[caseId]（詳細）

Step 7: メール通知
  - ステータス変更通知
  - 新規メッセージ通知

Step 8: 監査ログ連携
  - insurance_case_events への自動記録
  - vehicle_histories への案件イベント記録
```

### Phase 2: UX 改善 + 運用強化

```
- Supabase Realtime 統合
- アプリ内通知 + 未読バッジ
- 既読管理
- 手動参加者管理UI
- テンプレ返信
- 運営管理画面
- 案件検索の高度化（全文検索）
- ダッシュボードへの案件統計追加
```

### Phase 3: 拡張機能

```
- 第三者参加（鈑金工場）
- SLA管理
- 承認フロー
- 案件種別マスタ化
- 外部API連携
- PDF レポート
```

---

## 9. リスク一覧

### セキュリティリスク

| # | リスク | 影響度 | 対策 |
|---|--------|-------|------|
| 1 | **保険会社が internal メッセージを閲覧** | 致命的 | RLS で `visibility = 'shared'` を強制 + DB トリガーで保険会社ユーザーの visibility を強制上書き |
| 2 | **保険会社が案件外の証明書を閲覧** | 高 | `insurance_case_certificates` リンクテーブル経由でのみアクセス。RLS で制御 |
| 3 | **他テナントの案件が見える** | 致命的 | `my_tenant_ids()` による RLS。保険会社は `my_insurer_id()` |
| 4 | **draft 案件が保険会社に見える** | 中 | RLS で `status != 'draft'` を条件に追加 |
| 5 | **添付ファイルの直接URL漏洩** | 高 | Storage バケット `public = false` + Signed URL (5分有効期限) |
| 6 | **ステータスの不正遷移** | 中 | API Route でステータス遷移ルールを検証。DB トリガーでも検証（多層防御） |
| 7 | **参加者でないユーザーがメッセージ送信** | 高 | RLS の `is_case_participant()` + API Route での二重チェック |
| 8 | **is_case_participant() のパフォーマンス** | 中 | `insurance_case_participants(case_id, user_id)` の UNIQUE 制約がインデックスとして機能 |

### 権限漏れの事故パターン

| # | パターン | 原因 | 防止策 |
|---|---------|------|--------|
| 1 | UI で非表示にしただけで API からは取得可能 | RLS 未設定 | **全テーブルに RLS を設定。UI での非表示は「追加の安全策」であり「唯一の防御」にしない** |
| 2 | `service_role` クライアントを使ってしまう | コードミス | service_role は監査ログ記録と Storage 操作のみに限定。案件データ取得には使わない |
| 3 | 保険会社ユーザーが施工店ユーザーとしても登録されている | ユーザー管理ミス | `my_tenant_ids()` と `my_insurer_id()` は独立。同一ユーザーが両方に属する場合は両方の権限が適用される。**これは仕様として許容するが、運用ガイドラインで注意喚起** |
| 4 | RLS ポリシーの OR 条件で意図しない範囲が見える | 設計ミス | 各ポリシーを独立した CREATE POLICY で定義（OR ではなく複数ポリシー。PostgreSQL は複数ポリシーを OR で評価する） |

### 添付ファイル事故

| # | パターン | 対策 |
|---|---------|------|
| 1 | 巨大ファイルのアップロード | API Route でサイズチェック（10MB/ファイル） |
| 2 | 実行可能ファイルのアップロード | content_type のホワイトリスト検証（image/*, application/pdf, etc.） |
| 3 | ファイル名に不正文字 | サニタイズ + UUID ベースの storage_path |
| 4 | 削除したはずのファイルが Storage に残る | 添付レコード削除時に Storage からも削除（API Route で制御） |

### 同一車両判定

- 既存の `vehicles` テーブルには VIN（車台番号）がない。`plate_display` のみ
- 同一車両で複数案件は `vehicle_id` で紐付くため問題ない
- ただし、同じ車両を別レコードとして登録してしまうリスクがある
- **対策:** MVP では許容。Phase 2 以降で VIN カラム追加 + 重複検出を検討

### 顧客情報露出

- `vehicles` テーブルに `customer_name`, `customer_email`, `customer_phone_masked` がある
- 保険会社が `insurance_cases` 経由で `vehicles` を JOIN した場合、これらが見える可能性
- **対策:** 保険会社向けの vehicle 情報は API Route で必要フィールドのみを返す。RLS だけでなくアプリ層でも制御
- **追加対策:** 保険会社向けに vehicles の SELECT ポリシーは **追加しない**。案件の vehicle 情報は `insurance_cases` テーブルの `vehicle_id` を使って API Route で必要項目だけを返す

```typescript
// 保険会社向けの案件詳細 API
const vehicleInfo = {
  maker: vehicle.maker,
  model: vehicle.model,
  year: vehicle.year,
  plate_display: vehicle.plate_display,
  // customer_email, customer_phone_masked は含めない
};
```

### 監査ログの必要性

- **必須:** 全ステータス変更、メッセージ送信、添付アップロード、証明書リンクを `insurance_case_events` に記録
- **必須:** 保険会社の証明書閲覧を `insurer_access_logs` にも記録（既存の仕組みを活用）
- **推奨:** IP アドレス・User-Agent も記録（不正アクセス調査用）
- **注意:** fire-and-forget パターンを維持。監査ログの失敗でメイン処理をブロックしない

---

## 10. 最初に作るべき最小セットの要約

### 一言で言うと

**「施工店が車両に対して保険案件を起票し、保険会社が確認・返答できる。内部メモは保険会社に見えない」**

### 必須テーブル（9テーブル + 3関数）

```
新規テーブル:
  1. insurers               -- 保険会社マスタ
  2. insurer_users           -- 保険会社ユーザー
  3. platform_admins         -- 運営管理者
  4. insurance_cases         -- 保険案件
  5. insurance_case_participants -- 参加者
  6. insurance_case_messages -- メッセージ（visibility で内部/外部分離）
  7. insurance_case_attachments -- 添付ファイル
  8. insurance_case_certificates -- 証明書リンク
  9. insurance_case_events   -- イベントログ

新規関数:
  1. my_insurer_id()         -- 保険会社ユーザー判定
  2. is_platform_admin()     -- 運営管理者判定
  3. is_case_participant()   -- 案件参加者判定

既存テーブルへの変更:
  - certificates に保険会社向け SELECT ポリシー追加
  - certificate_images に保険会社向け SELECT ポリシー追加

新規 Storage バケット:
  - insurance-cases (public = false)
```

### 必須画面（6画面）

```
施工店側:
  1. /admin/vehicles/[id] 拡張（案件セクション）
  2. /admin/vehicles/[id]/insurance-cases/new（起票）
  3. /admin/insurance-cases（一覧）
  4. /admin/insurance-cases/[caseId]（詳細）

保険会社側:
  5. /insurer/cases（一覧）
  6. /insurer/cases/[caseId]（詳細）
```

### 必須 API Route（13エンドポイント）

上記セクション6の表を参照。

### 安全性の担保

- **RLS:** 全テーブルに設定。`is_case_participant()` が権限制御の核
- **visibility:** メッセージ・添付の internal/shared を RLS + DB トリガーで制御
- **証明書:** リンクテーブル経由のみ。車両の全証明書は保険会社に見せない
- **Storage:** private バケット + Signed URL
- **顧客情報:** API Route で返却フィールドを制限
- **監査:** 全操作を insurance_case_events に記録

### 実装開始の推奨順

```
1. マイグレーション SQL を書く（全テーブル + RLS + 関数 + トリガー）
2. src/types/insurance-case.ts を定義
3. API Route を1つずつ実装（案件 CRUD → メッセージ → 添付 → 証明書リンク）
4. 施工店側 UI を実装
5. 保険会社側 UI を実装
6. メール通知を実装
7. E2E テスト（特に RLS の権限境界テスト）
```

**RLS の権限境界テストは最優先。** 以下のケースを必ず検証:
- 保険会社ユーザーが `visibility = 'internal'` のメッセージを取得できないこと
- 他テナントの案件が見えないこと
- 案件にリンクされていない証明書が保険会社に見えないこと
- draft 案件が保険会社に見えないこと
- 参加者でないユーザーがメッセージを送信できないこと
