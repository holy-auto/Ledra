-- =============================================================
-- documents の SELECT に「直接 auth.uid() を引く」代替パスを追加 — 本番から復元したファイル
--
-- このマイグレーションは 2026-08-04 に Supabase MCP `apply_migration` で本番
-- (cahybswpduchptvyvdkk) へ直接適用され、`schema_migrations` にバージョン
-- 20260804064418 として記録されたが、対応するファイルがリポジトリに存在しなかった。
-- そのためリポジトリと本番履歴が乖離し、`supabase db push` が
--   "Remote migration versions not found in local migrations directory."
-- で 2026-08-02 以降ずっと失敗していた（OPEN_QUESTIONS 2026-08-05 追記）。
--
-- 本ファイルの内容は本番 `schema_migrations.statements` から復元したもの。
-- 復元にあたり `DROP POLICY IF EXISTS` を前置した点だけが原本と異なる
-- （リポジトリのポリシー定義の慣行に合わせ、再実行に耐えるようにするため）。
-- 本番では記録済みのため再実行されない（プレビュー/新規環境の再生時のみ実行される）。
-- =============================================================

-- documents の閲覧が my_tenant_ids() 単独に依存しており、実行時（PostgREST経由）に
-- my_tenant_ids() 経路だけ空になる事象で「帳票が表示されない」が発生。
-- vehicles で実績のある「直接 auth.uid() を使う代替パス」を documents にも追加する。
-- 追加・permissive・テナント厳格。RESTRICTIVE(documents_staff_invoice_restrict)は維持。
DROP POLICY IF EXISTS documents_tenant_access ON public.documents;
CREATE POLICY documents_tenant_access ON public.documents
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid()
    )
  );
