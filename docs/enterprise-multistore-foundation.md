# エンタープライズ多店舗基盤 (本社 + 支店 / FC)

エンタープライズ契約 (数店舗の同時展開、本社からの統括) に備えた基盤。
本ドキュメントは **データ基盤・RLS・取込 API** の設計と使い方をまとめる。
UI (本社横断ダッシュボード等) は後続フェーズ。

関連マイグレーション:

- `supabase/migrations/20260616000000_enterprise_org_foundation.sql`
- `supabase/migrations/20260616000001_external_ref_indexes.sql`

## 1. 用語と前提

- **テナント (tenant)** … 1 店舗 = 1 アカウント。データは `tenant_id` でスコープ + RLS。
- **組織 (organization)** … 本社。複数テナントを束ねる (既存テーブル)。
- **organization_members** … 組織に所属するテナント (店舗) の連結 (既存)。
- **stores** … テナント *内部* の物理店舗。本書の「支店 / FC」とは別概念
  (支店 / FC は独立テナントとして organization に紐づける)。

## 2. 本社チーム (複数ユーザ + 役割)

これまで本社は `organizations.owner_id` の単一ユーザのみだった。エンタープライズ
では本社に複数の担当者が必要になるため `organization_users` を追加した。

| role | ラベル | できること |
| --- | --- | --- |
| `org_owner` | 本社オーナー | 組織・メンバー・本社チームの管理、全店舗横断閲覧 |
| `org_admin` | 本社管理者 | 全店舗横断閲覧 (+ 将来の組織設定) |
| `org_viewer` | 本社閲覧者 | 全店舗横断閲覧のみ |

TS 側のラベル / ランク定義: `src/lib/auth/orgRoles.ts`。

## 3. 権限方針 (要件③: 本社以外は他店を変更できない)

**閲覧は横断・書込は店舗単位。**

- 本社ユーザは組織配下の全店舗の **顧客 / 車両 / 作業履歴 / 帳票 / 予約** を
  横断 **閲覧** できる (`my_org_tenant_ids()` を参照する SELECT ポリシー)。
- データの **書込 (INSERT/UPDATE/DELETE)** は従来通り `tenant_memberships`
  (= その店舗のメンバー) が必要。本社ユーザは横断 READ ポリシーしか持たない
  ため、自分がメンバーである店舗以外は変更できない。
- 各店舗ユーザは自店の `tenant_id` 以外を参照できない (既存の RLS のまま)。
  → 支店 / FC は他店を閲覧も変更もできない。

RLS ヘルパー (どちらも `security definer`, `search_path=''`):

- `my_org_ids()` … `organizations.owner_id = auth.uid()` または
  `organization_users` に居る組織 ID。
- `my_org_tenant_ids()` … 上記組織に紐づく全テナント ID。

> 補足: 「店舗を持たない純粋な本社ユーザ」のセッション解決
> (`resolveCallerFull` は現状 tenant 必須) は後続フェーズで対応する。
> RLS 上の横断 READ は本マイグレーションで既に有効。

## 4. 基幹ソフト連携 (Push 取込) API

各店舗が利用する基幹ソフトが Ledra の v1 API を叩いて、顧客 / 車両 / 作業履歴を
送り込む (Push)。Ledra は冪等に upsert するため、再同期しても重複しない。

### 認証 / スコープ

- ヘッダ: `Authorization: Bearer lk_live_xxxx` (テナント API キー)。
- キーに紐づく `tenant_id` にスコープが固定される (ペイロードの tenant 指定は無視)。
- 必要スコープ (`tenant_api_keys.scopes`、`*` でも可):
  - `customers:write`
  - `vehicles:write`
  - `work_history:write`

### 冪等性

`(tenant_id, source_system, external_ref)` で upsert。`source_system` は連携元
識別子 (例 `broadleaf`)、`external_ref` は連携元での一意 ID。手動作成レコードは
`external_ref` が NULL のため一意制約の対象外 (Postgres は UNIQUE 内 NULL を
distinct 扱い)。

### エンドポイント

すべて `POST`、最大 500 件 / リクエスト。

#### `POST /api/v1/ingest/customers`

```jsonc
{
  "source_system": "broadleaf",
  "records": [
    { "external_ref": "C-001", "name": "山田太郎", "email": "a@example.com", "phone": "090-..." }
  ]
}
```

#### `POST /api/v1/ingest/vehicles`

```jsonc
{
  "source_system": "broadleaf",
  "records": [
    { "external_ref": "V-001", "maker": "トヨタ", "model": "プリウス", "year": 2021, "plate_display": "品川 300 あ 12-34" }
  ]
}
```

#### `POST /api/v1/ingest/work-history`

`vehicle_external_ref` で取込済み車両 (同一 `source_system`) に紐づける。
解決できなかったレコードは `unresolved_vehicles` として返す (取込されない)。

```jsonc
{
  "source_system": "broadleaf",
  "records": [
    {
      "external_ref": "W-001",
      "vehicle_external_ref": "V-001",
      "type": "車検",
      "title": "24ヶ月点検",
      "description": "...",
      "performed_at": "2026-01-15T09:00:00+09:00"
    }
  ]
}
```

### レスポンス

```jsonc
{ "ok": true, "result": { "total": 10, "inserted": 7, "updated": 3, "failed": 0, "status": "completed" } }
```

`status` は `completed` / `partial` / `failed`。取込実行は監査用に
`integration_sync_runs` に記録される (店舗 / 本社から閲覧可)。

## 5. 本社チーム管理 / 横断リード API (Phase 2)

UI に先行して API 層を提供する。すべて admin セッション認証 + 組織アクセス権で保護。

### 本社チーム (`organization_users`) 管理 — owner のみ書込

- `GET    /api/admin/organizations/[id]/users` — 本社チーム一覧 (owner / メンバー閲覧可)
- `POST   /api/admin/organizations/[id]/users` — メール招待で追加 `{ email, role }`
- `PUT    /api/admin/organizations/[id]/users` — ロール変更 `{ user_id, role }`
- `DELETE /api/admin/organizations/[id]/users?user_id=…` — 除外

`role` は `org_admin` / `org_viewer` のみ割当可 (`org_owner` は `organizations.owner_id` 専用)。

### 本社横断リード (read-only) — owner / 本社メンバー

- `GET /api/admin/organizations/[id]/stores` — 所属店舗一覧
- `GET /api/admin/organizations/[id]/stores/[tenantId]/customers`
- `GET /api/admin/organizations/[id]/stores/[tenantId]/vehicles`
- `GET /api/admin/organizations/[id]/stores/[tenantId]/work-history?vehicle_id=…`

共通: `?limit` (1..200, 既定50) / `?offset`。対象 `tenantId` が組織所属であることを検証し、
RLS バイパスの platform-scoped admin で `tenant_id` スコープして読む。書込手段は提供しない
(本社は閲覧のみ)。認可ヘルパー: `src/lib/api/orgStoreRead.ts` / `src/lib/auth/orgAccess.ts`。

## 6. 後続フェーズ

- 本社横断 UI (店舗一覧 → 顧客 / 車両 / 作業履歴のドリルダウン閲覧) — 上記 API を利用。
- 店舗を持たない本社専用ユーザのセッション / ナビゲーション解決
  (現状 `resolveCallerWithRole` は tenant membership を要求するため、本社専用アカウントは
  別途いずれかの店舗メンバーである必要がある)。
- API キー発行時のスコープ UI への取込スコープ追加。
- 双方向同期 (Ledra → 基幹) の outbound webhook トピック拡張。
