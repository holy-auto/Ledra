-- anon（未ログイン）から certificates を読めなくする。
--
-- 背景: 本番にだけ anon 向け SELECT ポリシーが 2 本あった（マイグレーションに無いドリフト。
-- OPEN_QUESTIONS 2026-09-08「本番にあってマイグレーションに無い RLS ポリシーがある」）。
--   - cert_public_read_active                     … status = 'active'
--   - "public read active certificates by public_id" … status = 'active' and public_id is not null
-- anon は certificates にテーブル単位の SELECT 権限も持っていたため、公開されている
-- anon キーだけで `/rest/v1/certificates?select=customer_name,...&status=eq.active` が通り、
-- **全テナントの有効な証明書の顧客名・自由記述・備考・金額**を列挙できた。
-- （2026-09-27 に本番で `set local role anon` して件数のみ確認: 24行・6テナント・顧客名24件）
-- certificates_public ビューの NULL 化は、ビューを通らない直読みには効かない。
--
-- このポリシーに依存していたのは公開 PDF ルート（/api/certificate/pdf）だけで、
-- 同じ変更でサービスロール経由の読み取りに切り替えた。公開ページ /c/[public_id] は
-- 元からサービスロール（publicData.ts）。他テーブルの RLS から certificates を anon で
-- 参照するポリシーも無いことを本番の pg_policies で確認済み。
--
-- 再生 DB にはこの 2 本が無いので if exists。

drop policy if exists cert_public_read_active on public.certificates;
drop policy if exists "public read active certificates by public_id" on public.certificates;

-- ポリシーが将来また足されても anon に届かないよう、権限の側でも塞ぐ。
revoke all on table public.certificates from anon;
revoke all on table public.certificates_public from anon;
