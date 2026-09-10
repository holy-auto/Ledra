-- vehicle_histories.updated_at が本番にだけ在り、マイグレーションから再生した DB には
-- 無い（列レベルのドリフト）。#1045 の検出器はオブジェクトの有無（テーブル・ビュー・
-- 関数・トリガ・enum・イベントトリガ）を見るので、**列の欠落は見えない**。
--
-- 実害は 20260907010100 で本番から書き起こしたトリガ trg_vehicle_histories_set_updated_at
-- に出る。set_updated_at は new.updated_at に代入するので、この列が無い再生 DB では
-- vehicle_histories を UPDATE した瞬間に 42703（record "new" has no field "updated_at"）
-- で落ちる。plpgsql_check をトリガの全テーブルに対して回すようにして見つけた。
--
-- 本番では no-op（列は既に在る。timestamptz not null default now()、実測確認済み）。
-- 効くのは空 DB からの再生だけなので、本番で 964 行の書き換えは起きない。
alter table public.vehicle_histories
  add column if not exists updated_at timestamptz not null default now();
