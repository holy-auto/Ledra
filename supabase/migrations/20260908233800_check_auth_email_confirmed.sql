-- =============================================================
-- check_auth_email_confirmed: /api/signup の再登録時、既存アカウントが
-- メール未確認かどうかを判定するためのヘルパー。
--
-- 背景 (code-review 指摘, 2026-09-08): /api/signup は email_confirm: false
-- で作成するため、確認メールを踏むまでログインできない。1回目の確認メールが
-- 届かない/期限切れになった利用者が signup をもう一度叩くと、
-- createUser が "already registered" エラーを返し、従来はここで
-- 「登録済みです、ログインしてください」の案内メールだけを送っていた。
-- しかし未確認のアカウントはログインできないため、利用者はどこにも
-- 進めなくなる（確認メールを再送する手段が無い）。
--
-- check_auth_email_exists（列挙オラクル対策で存在有無だけ返す既存関数）を
-- そのまま拡張すると呼び出し元の意味が変わってしまうため、確認状態の判定は
-- 新しい関数に分ける。listUsers API が page 1 しか返さない制約を回避する
-- ため、既存の check_auth_email_exists と同じ形で auth.users を直接見る。
--
-- 戻り値: 該当ユーザーが存在し、かつ email_confirmed_at が null（未確認）
-- なら true。存在しない、または確認済みなら false。
-- =============================================================

create or replace function check_auth_email_unconfirmed(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from auth.users
    where lower(email) = lower(p_email)
      and email_confirmed_at is null
  );
end;
$$;

revoke all on function check_auth_email_unconfirmed(text) from public, anon, authenticated;
grant execute on function check_auth_email_unconfirmed(text) to service_role;
