# マイグレーション運用

## いちばん大事なこと

**マイグレーションは、空の PostgreSQL に「ファイル名順・1パスで」流して通ること。**
CI の `Migrations Replay` ジョブ（`npm run check:migrations`）がこれを見ている。

```bash
npm run check:migrations          # 一時 DB を立てて全部を1パスで流す（3分ほど）
node scripts/replay-migrations.mjs --keep   # 終了後も DB を残す（調査用）
```

**1パスなのが要点。** Supabase のブランチ機能（PR ごとのプレビュー DB）は
ファイル名順に1回だけ流して、最初の1本で落ちたらそこで止まる。多重パスで通ることには
意味が無い。2026-09-03 まではこの検査が多重パスで順序の逆転を吸収していたため、
**`Supabase Preview` だけが赤いのに CI は緑**という状態が続いていた。

## なぜこの検査が要るのか

2026-08-23 に、**本番にはあるのにマイグレーションのどこにも書かれていない列が
26 個 / 9 テーブル**見つかった。原因は「本番と食い違っていることに気づく手段が
無かった」こと。マイグレーションを空 DB に流し直せない状態が続くと、この種の
ずれは静かに増え続ける。

同じ調査で、**本番にあるのに再生では作られないテーブルが 5 つ**見つかった
（`signature_sessions` / `signature_audit_logs` / `vehicle_mileage_logs` /
`vehicle_inspection_findings` / `vehicle_part_replacements`）。
これらは `20260826000005_repair_unreplayable_objects.sql` で本番の定義そのまま
書き起こしてある（`if not exists` なので本番では no-op）。

## 再生の仕組み

1. `scripts/replay/bootstrap.sql` で、Supabase が既定で持っているものを作る
   （ロール `anon`/`authenticated`/`service_role`、`auth`/`storage` スキーマ、
   `auth.uid()` などの関数、拡張、`supabase_realtime` publication）。
   **ここにアプリのテーブルを書いてはいけない。** 書くと「再生できている
   ように見えるだけ」になる。
2. `supabase/migrations/*.sql` を**ファイル名順に1パスで**流す。
3. 落ちても止めずに最後まで進み、**1本でも落ちていたら全部を出して CI を落とす**。
   （1本ずつ直すのは遅いので、一度に全部見えるようにしてある）

`CREATE INDEX CONCURRENTLY` を含むファイルだけ `--single-transaction` を外す
（トランザクション内では実行できないため）。

## 2026-09-03: 順序の逆転 203 本を解消した

それまでは、ファイル名順に1パスで流すと **443 本中 203 本**が落ちていた（1本目の
`20260312000000_tenants_contact_fields.sql` から。`tenants` を作るのは
`20260313020000_core_tables.sql` で、ファイル名の日付が後ろ）。多重パスの検査では
これが見えず、`Supabase Preview` だけが赤い状態が続いていた。

**ファイル名は動かしていない。** 版番号（ファイル名の先頭14桁）が変わると本番の
`supabase_migrations.schema_migrations` に無い版として**再適用**され、当時の
「役割を見ない RLS ポリシー」や search_path 未固定の関数定義が復活してしまう。
代わりに次の2つでそろえた。

1. **前提が無いときは飛ばす。** 既適用ファイルの**中身だけ**を書き換え、
   `to_regclass` / `to_regprocedure` で前提の有無を見てから実行する。
   版番号を変えていないので本番では再適用されない＝本番への影響は無い。
2. **飛ばした分を後ろで補う。** 依存が揃った位置に新しいファイルを置く。
   いずれも「既にあれば何もしない」形なので、本番では no-op。
   - `20260313030000_replay_early_schema.sql`（customers / invoices / 列追加）
   - `20260313030001_replay_early_schema_index.sql`
   - `20260314000006_replay_market_inquiries.sql`
   - `20260321000003_replay_customer_login_codes_index.sql`
   - `20260601000009_replay_supply_columns.sql`

あわせて、**一度も存在しなかった名前**を参照していた既適用ファイルも中身を直した。
いずれも本番の実体に合わせたもので、根拠は
`20260719000000_fix_rls_membership_references.sql` の本番実査記録。

- `tenant_members` → `tenant_memberships`（`20260403000000` / `20260604000001`）
- `tenant_memberships.is_active` 述語の除去（`20260603020000` / `20260603020001`）
- 戻り値の型が違う同名関数を先に DROP（`20260325900000` / `20260325900001`）
- 本番にしか無い関数・ビューへの `revoke` / `grant` / `ALTER VIEW` を存在チェック付きに
  （`20260531000006` / `20260616000007` / `20260622000000`）

## 新しいマイグレーションを書くとき

- **前提は自分より前のファイルにあること。** 検査はファイル名順に1パスで流すので、
  「後ろのファイルが作るもの」に依存すると必ず落ちる。同じファイルの中で作るのが
  いちばん安全。どうしても前後が逆転する場合は、前側を「前提が無ければ飛ばす」形に
  して、依存が揃った位置に補いのファイルを置く（2026-09-03 の節を参照）。
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
