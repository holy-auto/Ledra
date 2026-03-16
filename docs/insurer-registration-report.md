# 保険会社（Insurer）登録・オンボーディング調査レポート

## 概要

本レポートは、holy-cert システムにおける保険会社（Insurer）の登録・管理機能の現状を調査した結果をまとめたものです。

---

## 1. 現状：部分的な実装

保険会社管理システムは**一部実装済み**ですが、いくつかの重要なピースが欠けています。

---

## 2. 既存のコアエンティティ

### データベーステーブル（定義済み）

#### `insurer_access_logs` — 監査ログテーブル

- 場所: `supabase/migrations/20260313020000_core_tables.sql`（177-189行目）
- フィールド: `id`, `insurer_id`, `insurer_user_id`, `certificate_id`, `action`, `meta`, `ip`, `user_agent`, `created_at`
- 目的: 保険会社ユーザーのアクセス・検索履歴を記録

### 参照されているが未定義のRPCファンクション

| RPC名 | 呼び出し元 |
|--------|-----------|
| `insurer_search_certificates` | `/api/insurer/search`, `/api/insurer/export` |
| `insurer_audit_log` | insurer export ルート |
| `is_insurer_admin` | insurer user CSV アップロード |
| `upsert_insurer_user` | insurer user CSV アップロード |

### 参照されているが未定義のテーブル

| テーブル名 | 参照箇所 |
|-----------|---------|
| `insurers` | `platform_insurer_count()` RPC（dashboard_enhancements.sql 63行目） |
| `insurer_users` | `/api/insurer/users/csv/route.ts`, `/lib/supabase/insurer/audit.ts` |

---

## 3. 保険会社ユーザーインターフェース（実装済み）

### フロントエンドページ

| ページ | パス | 機能 |
|-------|------|------|
| ログイン | `/insurer/login/page.tsx` | メール/パスワード認証（Supabase Auth） |
| 検索ポータル | `/insurer/page.tsx` | 証明書検索ダッシュボード |
| 証明書閲覧 | `/insurer/c/[public_id]/page.tsx` | 個別の証明書詳細表示 |
| パスワードリセット | `/insurer/reset-password/page.tsx` | パスワード再設定 |

### APIルート

| エンドポイント | 機能 |
|--------------|------|
| `/api/insurer/search` | 証明書検索（レート制限: 30リクエスト/分） |
| `/api/insurer/export` | 検索結果CSV出力（proプラン必須） |
| `/api/insurer/export-one` | 単一証明書PDF出力 |
| `/api/insurer/pdf-one` | 単一証明書PDF生成 |
| `/api/insurer/certificate/*` | 証明書詳細取得 |
| `/api/insurer/users/csv` | ユーザー一括CSVインポート |

---

## 4. 保険会社ユーザー管理フロー

### CSVインポートフロー (`/api/insurer/users/csv/route.ts`)

```
1. 認証: Cookie セッション or Bearer トークン
2. 管理者確認: is_insurer_admin() RPC で検証
3. insurer_id 解決: insurer_users から最初の管理者レコードを検索
4. CSV解析: カラム — email, role (admin|viewer|auditor), display_name
5. 各行に対して:
   - Supabase Auth ユーザー作成（存在しない場合）
   - upsert_insurer_user RPC でレコード作成/更新
6. 監査ログに記録
```

### 想定される `insurer_users` テーブルスキーマ

```sql
CREATE TABLE insurer_users (
  id uuid PRIMARY KEY,
  insurer_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  email text,
  role text NOT NULL,          -- 'admin', 'viewer', 'auditor'
  display_name text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### 想定される `insurers` テーブルスキーマ

```sql
CREATE TABLE insurers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  address text,
  billing_email text,
  plan_tier text DEFAULT 'pro',
  stripe_customer_id text,
  stripe_subscription_id text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

## 5. 課金連携

すべての保険会社関連APIは `enforceBilling()` でプランを確認:

- **insurer_export**: "pro" プラン以上が必要
- **insurer_users_csv**: "pro" プラン以上が必要

---

## 6. 完全な実装に必要な欠損ピース

### 6.1 データベース

1. `insurers` テーブルのマイグレーション作成
2. `insurer_users` テーブルのマイグレーション作成
3. 以下のRPCファンクション作成:
   - `insurer_search_certificates(p_query, p_limit, p_offset, p_ip, p_user_agent)`
   - `insurer_audit_log(p_action, p_target_public_id, p_query_json, p_ip, p_user_agent)`
   - `is_insurer_admin()`
   - `upsert_insurer_user(p_insurer_id, p_email, p_role, p_display_name)`

### 6.2 管理画面

1. 新規保険会社の登録・作成UI
2. 保険会社情報の管理画面
3. Stripe Connect による課金設定
4. 保険会社統計の表示（ダッシュボードに `platform_insurer_count` あり）

### 6.3 その他

1. 保険会社サインアップフロー（現在はログインのみ）

---

## 7. ファイル一覧

| コンポーネント | 場所 |
|--------------|------|
| コアテーブル | `supabase/migrations/20260313020000_core_tables.sql` |
| 監査ログテーブル | 同上 177-189行目 |
| ダッシュボードRPC | `supabase/migrations/20260313_dashboard_enhancements.sql` |
| 顧客・請求書テーブル | `supabase/migrations/20260313_add_service_price_and_customers.sql` |
| ログインUI | `src/app/insurer/login/page.tsx` |
| 検索ポータルUI | `src/app/insurer/page.tsx` |
| CSVインポートAPI | `src/app/api/insurer/users/csv/route.ts` |
| 検索API | `src/app/api/insurer/search/route.ts` |
| エクスポートAPI | `src/app/api/insurer/export/route.ts` |
| 監査ログlib | `src/lib/insurer/audit.ts`, `src/lib/supabase/insurer/audit.ts` |
| 管理者メンバー管理（参考） | `src/app/api/admin/members/route.ts` |
