-- =============================================================
-- job_orders.billing_method — 指名 (invoice) と 公開案件 (platform) の分岐
--
-- 指名/公開の別は「発注作成時」に確定する。公開案件は後から受注で
-- to_tenant_id が入るため、完了時の to_tenant 有無では判定できない。
--
--   platform : 公開案件を受注 → 現行フロー（手数料10%＋Stripe Connect送金＋
--              per-order 自動メール）。回帰させない。
--   invoice  : 指名依頼 → 手数料0・Stripe送金なし・請求書払い。顧客の支払
--              サイクルで下書き請求書を生成し、確認後に送付する。
--
-- 新規カラムのため既存行はすべて既定値 'platform' となり CHECK を満たす。
-- =============================================================

alter table job_orders
  add column if not exists billing_method text not null default 'platform'
    check (billing_method in ('platform', 'invoice'));

comment on column job_orders.billing_method is
  '請求方式。platform=公開案件(手数料10%+Stripe送金) / invoice=指名(手数料0・請求書払い)。作成時に確定。';

-- 既存行はすべて 'platform' 既定のまま（＝現行挙動を維持）。遡及補正はしない：
-- 在庫オーダーは旧モデル（手数料10%＋Stripe）で運用されてきたため platform 継続が正しい。
-- 以降に作成されるオーダーのみ、作成時に to_tenant_id 有無で billing_method を確定する。

