# マイグレーション運用

## いちばん大事なこと

**新しいマイグレーションは、空の PostgreSQL に流し直して通ること。**
CI の `Migrations Replay` ジョブ（`npm run check:migrations`）がこれを見ている。

```bash
npm run check:migrations          # 一時 DB を立てて 424 本を流し直す（3分ほど）
node scripts/replay-migrations.mjs --keep   # 終了後も DB を残す（調査用）
```

## なぜこの検査が要るのか

2026-08-23 に、**本番にはあるのにマイグレーションのどこにも書かれていない列が
26 個 / 9 テーブル**見つかった。原因は「本番と食い違っていることに気づく手段が
無かった」こと。マイグレーションを空 DB に流し直せない状態が続くと、この種の
ずれは静かに増え続ける。

同じ調査で、**本番にあるのに再生では作られないテーブルが 5 つ**見つかった
（`signature_sessions` / `signature_audit_logs` / `vehicle_mileage_logs` /
`vehicle_inspection_findings` / `vehicle_part_replacements`）。
これらは `20260824000000_repair_unreplayable_objects.sql` で本番の定義そのまま
書き起こしてある（`if not exists` なので本番では no-op）。

## 再生の仕組み

1. `scripts/replay/bootstrap.sql` で、Supabase が既定で持っているものを作る
   （ロール `anon`/`authenticated`/`service_role`、`auth`/`storage` スキーマ、
   `auth.uid()` などの関数、拡張、`supabase_realtime` publication）。
   **ここにアプリのテーブルを書いてはいけない。** 書くと「再生できている
   ように見えるだけ」になる。
2. `supabase/migrations/*.sql` をファイル名順に流す。
3. 失敗したファイルは覚えておき、**進捗がある限り何周でも繰り返す**。
   ファイル名の日付と依存関係が逆転している箇所があるため、多重パスで吸収する。
4. 何周しても通らないファイルを、既知の一覧（`KNOWN_UNREPLAYABLE`）と突き合わせる。
   - **一覧に無いものが出たら CI が落ちる**（新しく壊れた）
   - 一覧のものが通るようになっても CI が落ちる（一覧を更新させるため）

`CREATE INDEX CONCURRENTLY` を含むファイルだけ `--single-transaction` を外す
（トランザクション内では実行できないため）。

## 既知の「永久に再生できない」9 本

履歴を書き換えない限り直せないもの。**本番でもこれらは失敗している。**

| ファイル | 理由 |
|---|---|
| `20260403000000_add_electronic_signature.sql` | 一度も存在しなかったテーブル `tenant_members` を RLS ポリシーが参照（正しくは `tenant_memberships`） |
| `20260604000001_vehicle_prediction_data_infra.sql` | 同上 |
| `20260603020000_zkp_commitments.sql` | `tenant_memberships.is_active` を参照。この列は本番にも無い |
| `20260603020001_edge_devices_events.sql` | 同上 |
| `20260313000001_dashboard_enhancements.sql` | 1周目は `tenants` がまだ無い（`20260313020000_core_tables.sql` が後ろの日付）。多重パス後は戻り値の型違いで衝突 |
| `20260325900000_insurer_tenant_contracts.sql` | 同じ関数を戻り値の型違いで二重定義 |
| `20260325900001_insurer_search_plan_limits.sql` | 同上 |
| `20260531000006_security_invoker_views.sql` | 統合前の `invoices` を前提にしたビュー定義（現在は `documents` に統合済み） |
| `20260719000000_fix_rls_membership_references.sql` | 上記の後始末だが、`zkp_commitments` が作れないため連鎖して落ちる |

なぜ直さないか: 既存ファイルを書き換えると本番の適用履歴
（`supabase_migrations.schema_migrations`）と食い違い、再適用扱いになる危険がある。
新しい修復マイグレーションを足す方が安全で、既存の `repair_drift_*` とも揃う。

## 新しいマイグレーションを書くとき

- **同じファイルの中で前提を作る。** 他のファイルが先に流れている前提にしない
  （ファイル名の日付順 ≠ 依存順になっている箇所が実在する）。
- `CREATE INDEX` は `CONCURRENTLY` を付け、**専用のファイル**に分ける
  （トランザクション内で実行できないため）。`npm run lint:migrations` が見ている。
- `ADD CONSTRAINT ... CHECK` は `NOT VALID` を付け、`VALIDATE` を別ファイルにする。
- `SECURITY DEFINER` の関数は `SET search_path = ''` を付け、参照を全てスキーマ
  修飾する。
- 本番へ適用したら、`supabase/migrations/` のファイル名と**記録されたバージョンが
  一致しているか**を確認する。一致しない場合はファイル名を合わせる
  （合わせられない事情があるならヘッダにその旨を書く）。

## 本番との突き合わせ

列名の一致は `scripts/schema.snapshot.json` と `npm run check:schema` が見ている。
マイグレーションで列を増減したら、スナップショットも更新すること
（更新用の SQL は `scripts/schema.snapshot.README.md`）。
