# 電子点検整備記録簿の封緘（Recordbook Sealing）設計

> ステータス: **設計提案 / 実装前レビュー段階**
> 目的: 2025-07-08 に解禁された「電子」点検整備記録簿を、Ledra 上で **後から改ざん
> できない形**（＝確定時刻に内容が存在し以後改変されていないことを第三者に証明できる形）で
> 保存・交付できるようにする。既存の TSA/アンカリング基盤を **転用** し、新規実装を最小化する。
>
> 関連: `docs/industry-solvable-problems-2026-07.md`（課題④）／`docs/parts-installation-integrity-design.md`
> （TSA・封緘パターンの原典）／`docs/anchoring-roadmap.md`。

---

## 1. 背景（なぜ作るか）

- **制度追い風**: 2025-07-08、国交省が「電子」点検整備記録簿を解禁（紙とデジタルの二重管理を解消）。
- **電子帳簿保存法の整理**: 「**改ざん防止できるシステムを使えばタイムスタンプ付与自体が不要**」＝
  真実性の確保（改ざん防止／訂正削除履歴）が電子保存の要件。
- **ビッグモーター後の需要**: 整備記録の改ざん（T3: 確定後の書き換え）を第三者に対して否定できる
  状態が、保険・行政・ユーザー全方位で求められている。

## 2. 正直な現状とギャップ

現状の `inspection_records`（`supabase/migrations/20260612000018_inspection_checklists.sql`）は
**入庫/納車/定期の任意チェックリスト**であり、電子記録簿の封緘要件を満たさない:

| 観点 | 現状 | ギャップ |
|---|---|---|
| 確定 | `status` 概念なし。常に `updated_at` で **PATCH 更新可**（`src/app/api/admin/inspection-records/route.ts`） | 「確定（finalize）」状態と確定後の凍結が無い |
| 改ざん検知 | `content_sha256` / TSA / anchor 列なし | 内容ハッシュ・タイムスタンプ・オンチェーン存在証明が無い |
| 法定記載事項 | `answers`/`template_items` は自由テンプレ | 点検整備記録簿の法定記載事項に対応するテンプレ・検証が無い |
| 交付・保存 | 交付/検証 UI なし | ユーザーへの電子交付と保存期間管理が無い |

→ 「電子記録簿対応」は **未出荷**。ただし封緘に必要な部品はすべて既にリポジトリにある（§5）。

## 3. 達成目標

1. **確定（finalize）** — 記録を `finalized` にした時点で内容を凍結（以後 UPDATE 禁止）。
2. **封緘** — 確定時に canonical 内容の SHA-256 を計算し、**RFC3161 TSA** でタイムスタンプ、
   Polygon に存在証明をアンカー。
3. **交付・検証** — ユーザーが電子記録簿を閲覧でき、第三者が改ざんの有無を検証できる。
4. **保存** — 法定保存期間の管理（削除ガード）。

## 4. 設計原則（ponytail: 作らない・流用する）

1. **既存 TSA をそのまま使う** — `requestTimestamp()`（`src/lib/parts/tsa.ts`）は hex ハッシュを
   受け RFC3161 トークンを返す汎用関数。**部品専用ではない**ので記録簿にそのまま流用できる。
2. **アンカリングは証明書レコードの層を踏襲** — `certificateAnchorService.ts` の
   「canonical digest → `*_anchors` に queued → 日次 Merkle バッチ」パターンを写経する。
3. **確定後凍結は既存の guard トリガ方式を踏襲**（証明書の確定後凍結と同じ）。
4. **整合性値はサーバ計算のみ** — ハッシュはクライアント送信値を信用しない。
5. **env ゲートで段階リリース** — 未設定環境では no-op（確定は止めない）。既存 `PARTS_TSA_ENABLED`
   / `CERT_RECORD_ANCHOR_ENABLED` と同じ思想。

## 5. 再利用する既存部品（新規に書かない）

| 必要機能 | 既存実装 | 流用方法 |
|---|---|---|
| RFC3161 タイムスタンプ取得 | `requestTimestamp()` / `src/lib/parts/rfc3161.ts` | hex ダイジェストを渡すだけ。`PARTS_TSA_*` env を共用 or `RECORDBOOK_TSA_*` を追加 |
| canonical ダイジェスト計算 | `computeCertDigest()`（`src/lib/anchoring/certificateHashing.ts`） | 記録簿用の PII-free 入力型を定義し同パターンで実装 |
| アンカー enqueue → バッチ | `enqueueCertificateAnchor()` / `src/app/api/cron/anchor-batch/route.ts` | `inspection_record_anchors` を対象に同構造で追加 |
| 確定後凍結 | 証明書の freeze トリガ（`certificate_edit_histories` と同系） | `inspection_records` に `status` + freeze トリガを追加 |
| 段階リリース耐性 | `isMissingTableOrColumn()`（`certificateAnchorService.ts`） | そのまま利用 |

## 6. データモデル変更（最小）

`inspection_records` を破壊しない **追加専用**。封緘メタは append-only の兄弟表に置く:

```sql
-- inspection_records に確定状態を追加
alter table inspection_records
  add column if not exists status text not null default 'draft'
    check (status in ('draft','finalized')),
  add column if not exists finalized_at timestamptz,
  add column if not exists content_sha256 text;   -- 確定時の canonical hash (64 hex)

-- 封緘トークン（TSA）とアンカーは append-only の兄弟表
create table if not exists inspection_record_seals (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  record_id      uuid not null references inspection_records(id) on delete cascade,
  content_sha256 text not null,
  tsa_token      bytea,          -- RFC3161 CMS DER（isTsaEnabled() のとき）
  tsa_authority  text,
  tsa_at         timestamptz,
  anchor_tx_hash text,           -- Polygon（CERT_RECORD_ANCHOR_ENABLED 相当が true のとき）
  anchor_network text,
  created_at     timestamptz not null default now()
);
```

確定後 UPDATE 禁止トリガ（証明書と同方式・ponytail: 既存パターン写経）:
```sql
create or replace function forbid_finalized_inspection_update() returns trigger as $$
begin
  if old.status = 'finalized' then
    raise exception 'inspection_record % is finalized and immutable', old.id;
  end if;
  return new;
end $$ language plpgsql;
```

## 7. フロー（確定→封緘→交付）

```
作成(draft, PATCH可)
  → 確定 finalize:
      1. サーバで canonical 内容(法定記載事項＋answers)の SHA-256 を計算 → content_sha256
      2. requestTimestamp(sha256) で RFC3161 トークン取得（未設定なら null=封緘スキップ）
      3. status='finalized' に更新（以後 UPDATE はトリガで拒否）
      4. inspection_record_seals に (sha256, tsa_token, ...) を INSERT
      5. enqueue → 日次 Merkle バッチで Polygon に anchor_tx を記録
  → 交付: 顧客ポータル/検証URLで記録簿を表示、封緘状態(TSA時刻・Tx)を提示
```

## 8. 法定・電帳法要件のマッピング

| 要件 | 本設計の対応 |
|---|---|
| 真実性の確保（改ざん防止 or 訂正削除履歴） | 確定後凍結トリガ＋content_sha256＋TSA＋アンカー |
| 可視性（見読可能） | 顧客ポータル/検証UIで表示 |
| 検索性 | 既存の tenant/vehicle/reservation インデックスを流用 |
| 点検整備記録簿の法定記載事項 | 専用テンプレ（`inspection_templates`）に法定項目セットを用意（別タスク） |

## 9. 段階リリース

- `RECORDBOOK_SEAL_ENABLED`（既定 false）で全体をゲート。false のとき確定はできるが封緘は no-op。
- TSA は `PARTS_TSA_*`（or 専用 `RECORDBOOK_TSA_*`）未設定なら null（封緘スキップ、確定は継続）。
- アンカーは本番 Polygon コントラクト未デプロイなら enqueue のみ（既存挙動と同一）。

## 10. 検証（実装時の runnable check）

- **確定不変性**: `finalized` 行を UPDATE → トリガで例外になる assert テスト1本。
- **封緘の決定性**: 同一内容から同一 `content_sha256` が出ること（canonical 化が安定）を検証するテスト。
- **no-op 安全性**: env 未設定で finalize → 例外なく完了し `tsa_token IS NULL` になること。
- E2E: draft 作成 → finalize → 検証URLで TSA 時刻/Tx が表示されることを実機で確認。

## 11. 正直な限界（ponytail: 天井を明記）

- **TSA/アンカー未設定環境では封緘されない**（no-op）。「改ざん不能」を主張するには本番 env の
  有効化が前提。→ アップグレードパス: `RECORDBOOK_SEAL_ENABLED=true` ＋ `PARTS_TSA_URL` ＋
  Polygon コントラクトのデプロイ。
- **法定記載事項の完全性はテンプレ設計に依存**。封緘は「記録が確定後に改変されていない」ことは
  保証するが、「記録内容が法令上十分か」は担保しない（テンプレ整備＝別タスク）。
- 確定前（draft）の改ざんは対象外。決め手は「確定＝封緘の瞬間」。
