-- =============================================================================
-- part_installations.certificate_id の支援索引 (CONCURRENTLY)
--
-- Companion to 20260703000000 (カラム追加)。
-- CREATE INDEX CONCURRENTLY はトランザクション内で実行できないため別ファイル。
-- =============================================================================

create index concurrently if not exists idx_part_installations_certificate
  on part_installations (certificate_id)
  where certificate_id is not null;
