# schema.snapshot.json

`public` スキーマのテーブル/ビューと列名のコピー。`schema.check.ts` が
モバイルの全 Supabase クエリをこれと突き合わせ、存在しない列・関係を
`npm test` で落とす。

## なぜ要るか

supabase-js のクエリはただの文字列で、TypeScript も ESLint も中身を見ない。
存在しない列を書くと PostgREST がクエリごと 400 を返し、画面には
「まだ登録されていません」と出る。**データはあるのに空に見える**ので、
実機で触っても「登録がまだなのだろう」と読めてしまい発見が遅れる。

実際に 13 画面・27 箇所がこの状態だった（2026-08-23、DECISION_LOG 参照）。

## 更新方法

マイグレーションで列やテーブルを増減したら、このファイルを更新する。

```sql
-- Supabase の SQL エディタで実行し、結果を schema.snapshot.json に貼る
select json_object_agg(table_name, cols)::text from (
  select c.table_name, json_agg(c.column_name order by c.column_name) as cols
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type in ('BASE TABLE','VIEW')
  group by c.table_name
) s;
```

## 本来やるべきこと

`npm run db:typegen` が生成する型でクエリを型付けすれば、この照合は要らなくなる
（`tsc` が直接落とす）。生成型が未コミットで、Metro もアプリディレクトリ外を
解決しないため、今はこのスナップショット照合で止めている。
