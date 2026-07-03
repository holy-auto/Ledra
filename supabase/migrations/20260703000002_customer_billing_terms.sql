-- =============================================================
-- 顧客区分 (法人/個人) と 支払い条件
--
-- 案件サインオフ・ワークフローの「お会計」ステップを顧客区分×支払い
-- サイクルで自動判定するために、customers に区分と請求条件を追加する。
--
--   customer_type      : individual (個人/BtoC) | corporate (法人/BtoB)
--   billing_cycle      : per_job (都度払い) | consolidated (合算/締め払い)
--                        法人のみ意味を持つ。アプリ層で法人時は必須にする。
--   billing_terms_note : 締め日・支払いサイトなどの自由記述メモ (最小構成)。
--
-- 判定ロジック (src/lib/signoff/state.ts):
--   - 法人 × consolidated → この案件では会計不要 (後日合算請求)
--   - 法人 × per_job       → 会計を挟む
--   - 個人 (paid=事前決済) → 会計不要
--   - 個人 (未払い=その場)  → 会計を挟む
--   - 法人 × billing_cycle 未設定 → 会計ステップでブロック (設定を促す)
-- =============================================================

alter table customers
  add column if not exists customer_type text not null default 'individual'
    check (customer_type in ('individual', 'corporate'));

alter table customers
  add column if not exists billing_cycle text
    check (billing_cycle in ('per_job', 'consolidated'));

alter table customers
  add column if not exists billing_terms_note text;

comment on column customers.customer_type is
  '顧客区分。individual=個人(BtoC) / corporate=法人(BtoB)。';
comment on column customers.billing_cycle is
  '法人の支払いサイクル。per_job=都度払い / consolidated=合算(締め払い)。'
  '法人はアプリ層で必須。個人では NULL。';
comment on column customers.billing_terms_note is
  '締め日・支払いサイト等の自由記述メモ (任意)。';
