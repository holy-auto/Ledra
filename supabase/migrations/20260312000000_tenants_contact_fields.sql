-- Add contact/address fields to tenants table
--
-- このファイルは本番へ適用済み（version 20260312000000）。**内容だけ**を後から
-- 変えてある。理由:
--   ファイル名の日付が `20260313020000_core_tables.sql`（tenants を作る側）より
--   **前**なのに、その tenants に依存している。空 DB へファイル名順に1パスで流す
--   Supabase のブランチ機能は、ここで `relation "tenants" does not exist` で止まる。
--   ファイル名を後ろへ動かせば順序は直るが、**バージョンが変わって本番で再適用**に
--   なるため採らない（本番の schema_migrations は版番号で管理されている）。
--
-- 前提が無いときは何もしない。空 DB では core_tables が tenants を
-- **この4列を含めて**作るので、飛ばしても最終状態は変わらない。
-- 恒久対応は baseline 方式（docs/operations/migrations.md）。
DO $mig$
BEGIN
  IF to_regclass('public.tenants') IS NULL THEN
    RAISE NOTICE '20260312000000: tenants が未作成のため skip（core_tables が同じ4列を作る）';
    RETURN;
  END IF;

  ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS contact_email text,
    ADD COLUMN IF NOT EXISTS contact_phone text,
    ADD COLUMN IF NOT EXISTS address       text,
    ADD COLUMN IF NOT EXISTS website_url   text;
END
$mig$;
