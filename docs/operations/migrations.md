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
2. **飛ばした分を、依存が揃った位置の既適用ファイルの末尾で補う。**
   いずれも「既にあれば何もしない」形なので、本番では no-op。

   | 補う中身 | 足した先（既適用ファイルの末尾） |
   |---|---|
   | customers / invoices / certificates・tenants の列・索引 | `20260313020000_core_tables.sql` |
   | market_inquiries / _messages / market_deals | `20260314000003_market_vehicles.sql` |
   | `idx_customer_login_codes_tenant_email` | `20260321000001_customer_portal_tables.sql` |
   | supply_partners.is_trusted 等 | `20260601000006_supply_partners.sql` |
   | email 系関数の `revoke execute` | `20260826000005_repair_unreplayable_objects.sql` |

   **新しいファイルを作ってはいけない。** 下の節を参照。

あわせて、**一度も存在しなかった名前**を参照していた既適用ファイルも中身を直した。
いずれも本番の実体に合わせたもので、根拠は
`20260719000000_fix_rls_membership_references.sql` の本番実査記録。

- `tenant_members` → `tenant_memberships`（`20260403000000` / `20260604000001`）
- `tenant_memberships.is_active` 述語の除去（`20260603020000` / `20260603020001`）
- 戻り値の型が違う同名関数を先に DROP（`20260325900000` / `20260325900001`）
- 本番にしか無い関数・ビューへの `revoke` / `grant` / `ALTER VIEW` を存在チェック付きに
  （`20260531000006` / `20260616000007` / `20260622000000`）

## 再生を通すための補いは、新しいファイルにしない

**空 DB の再生を通すためだけの補いは、依存が揃った位置の「既に本番へ適用済みの
ファイル」の末尾に足す。新しいファイルを作らない。**

理由は再生ではなく本番側にある。本番の `supabase db push` は、本番の
`schema_migrations` の最新より**古い**バージョンのファイルが未適用で残っていると
out-of-order で停止し、**それ以降のマイグレーションが本番へ一切届かなくなる**
（`.github/workflows/db-migrate.yml` の不変条件2）。2026-08-02〜08-15 に13日間
これで止まり、証明書発行が全件停止している。

補いは定義上「依存が揃う位置」＝過去の位置に置きたいので、新しいファイルにすると
必ず古いバージョンになる。適用済みファイルの**中身**を変えるぶんには、版番号が
変わらないので本番では再適用されない＝影響が無い。だから中身に足す。

- `npm run lint:migrations` の `migration-version-before-base-head` が静的に見ている
  （base ブランチに在るどのファイルよりも後のバージョンか）。
- **本番へ当てたい変更**は逆で、必ず本番の最新より後のバージョンの新しいファイルに
  する。マージ直前に本番の台帳を引いて確かめること:
  `select max(version) from supabase_migrations.schema_migrations;`

## CONCURRENTLY は「1ファイル1文」

2026-09-04 に、順序逆転を直して初めて実物のプレビュー DB が先まで進み、次が出た。

```
ERROR: CREATE INDEX CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)
At statement: 1
```

**Supabase のブランチ機能は、1ファイルに複数文があるとパイプラインで送る。**
`CREATE INDEX CONCURRENTLY` はパイプラインの中では実行できないので、
**2文目以降**の CONCURRENTLY が落ちる（1文目は通る）。

**手元では再現しない。** `npm run check:migrations` は `psql -f` で流していて
パイプラインを使わないため、CONCURRENTLY が何文あっても通ってしまう。
そこで**静的な lint** で止めている
（`scripts/lint-migrations.js` の `concurrently-in-multi-statement-file`）。

適用済みだった13ファイルは **CONCURRENTLY を外した**（本番では再適用されず、
空 DB では対象テーブルが空なのでロックの問題は起きない）。
そのぶん `create-index-without-concurrently` の対象からは外してある
（`supabase/migrations.allowlist` の 2026-09-04 の節）。

## bootstrap.sql に「あると便利」を足さない

`scripts/replay/bootstrap.sql` は **Supabase が新規プロジェクトに既定で持っているもの
だけ**を書く場所。ここに足りないものを足して再生を通すと、
**マイグレーションが自分で作っていない依存に気づけなくなる。**

2026-09-04 の実例: `pg_trgm` を bootstrap で作っていたため、
`20260616000005_move_pg_trgm_to_extensions_schema.sql` の
`alter extension pg_trgm set schema extensions` が手元では通っていた。
**`pg_trgm` を作るマイグレーションは1本も無い**（本番には手で入っている）。
Supabase の既定にも入らないので、実物のプレビュー DB では
`extension "pg_trgm" does not exist (SQLSTATE 42704)` で落ちた。

直し方は、そのマイグレーション自身に「無ければ作る」を持たせること。
bootstrap からは既定でない拡張（pg_trgm / btree_gin / btree_gist / unaccent）を外した。

## 手元は PostgreSQL 16、Supabase は 15

再生検査が立てる一時 DB は **PostgreSQL 16**、Supabase のプレビュー DB は **15**。
この差で一番効くのがこれ。

```sql
drop policy if exists foo on public.missing_table;
```

**PG16 は NOTICE を出して skip する。PG15 は `relation does not exist (SQLSTATE 42P01)`
で落ちる。** つまり「本番にしか無いテーブル」に対する `DROP ... IF EXISTS ... ON` は、
手元では一度も再現しない。

`scripts/lint-migrations.js` の `drop-if-exists-on-uncreated-relation` が静的に見ている。
**マイグレーションが作っていないリレーション**への `DROP POLICY / TRIGGER IF EXISTS` は
`to_regclass` で存在を見てから実行すること。

## 新しいマイグレーションを書くとき

- **バージョンは本番の最新より後にすること。** 古いと本番の `db push` が
  out-of-order で止まり、以降のマイグレーションが本番へ届かなくなる。
  マージ直前に本番の台帳を引いて確かめる（上の節）。
- **前提は自分より前のファイルにあること。** 検査はファイル名順に1パスで流すので、
  「後ろのファイルが作るもの」に依存すると必ず落ちる。同じファイルの中で作るのが
  いちばん安全。どうしても前後が逆転する場合は、前側を「前提が無ければ飛ばす」形に
  して、**依存が揃った位置の既適用ファイルの末尾**に補いを足す（新しいファイルは
  作らない。2026-09-03 と「再生を通すための補いは〜」の節を参照）。
- `CREATE INDEX` は `CONCURRENTLY` を付け、**専用のファイル**に分ける。
  理由は2つで、(1) トランザクション内で実行できない、(2) Supabase は複数文を
  パイプラインで送るため2文目以降が落ちる。**CONCURRENTLY を含むファイルは1文だけ。**
  `npm run lint:migrations` が両方を見ている。
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
