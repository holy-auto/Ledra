-- ============================================================
-- agents に振込先・郵便番号・ウェブサイトの保存先を足す
--
-- 状況:
--   代理店の設定画面は 銀行名 / 支店名 / 口座種別 / 口座番号 / 名義 /
--   郵便番号 / ウェブサイト を入力できるが、**agents にどれも列が無い**。
--   これらを含む更新は PostgREST が弾き、設定の保存そのものが失敗していた。
--   代理店への支払いに口座情報が要るため、Ledra 上に持てる形にする。
--
--   形は tenants.bank_info（jsonb）と揃える。列を5本並べるより、
--   口座情報を1つの塊として扱えて RLS / 監査の対象も1箇所で済む。
--
-- bank_info の形:
--   { "bank_name": "みずほ銀行", "branch": "渋谷支店",
--     "account_type": "ordinary" | "checking",
--     "account_number": "1234567", "account_holder": "カ)ホーリー" }
--
-- 注: 口座情報は機微情報。既存の tenants.bank_info と同じ扱い（RLS で
--     テナント境界を守る／管理画面からのみ読み書き）にする。
--
-- 適用済み: 本番へは MCP 経由で version 20260823154504 として適用済み。
-- ファイル名をその version に合わせてあるので、CI の db-migrate は
-- 適用済みとして飛ばす（合わせないと同じ変更が2重に記録され、
-- まさに今回直そうとしている「履歴と実体のずれ」を新しく作ることになる）。
-- ============================================================

alter table public.agents add column if not exists bank_info   jsonb;
alter table public.agents add column if not exists postal_code text;
alter table public.agents add column if not exists website_url text;

comment on column public.agents.bank_info is
  '振込先（銀行名・支店・口座種別・口座番号・名義）。tenants.bank_info と同じ形';
