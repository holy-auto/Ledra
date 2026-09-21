-- ============================================================
-- 「1証明書につき有効な NFC タグは1つ」を本番へ戻す
-- ============================================================
-- **これも本番で実際に実行される文である。**
--
-- `idx_nfc_active_certificate` は `20260918142610 remote_schema` が本番だけで落とした
-- 38 本の索引のひとつ（20260921093304 のヘッダと同じ出典）。
-- 消えている間、本番は同じ証明書に対して `written` / `attached` の NFC タグを
-- 複数持てる状態だった。
--
-- 事前確認（2026-09-21 実測）: nfc_tags は **0 行**。重複は起こりようがない。
-- 定義は再生 DB の pg_get_indexdef と同一（＝マイグレーションが本来作る形）。
-- ============================================================
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_nfc_active_certificate
  ON public.nfc_tags USING btree (certificate_id)
  WHERE ((status = ANY (ARRAY['written'::text, 'attached'::text])) AND (certificate_id IS NOT NULL));
