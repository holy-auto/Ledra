-- =============================================================
-- vehicle_histories_type_check の削除（本番 DB ドリフト解消）
--
-- vehicle_histories.type は core_tables (20260313020000) 以来
-- 自由テキスト (text not null) であり、リポジトリのマイグレーションに
-- CHECK 制約は存在しない。しかし本番 DB にだけ 8 値
-- (certificate_issued/certificate_voided/maintenance/repair/
--  inspection/delivery/note/custom) のみ許可する
-- vehicle_histories_type_check が存在し（リポジトリ未管理のドリフト）、
-- 以下の INSERT がすべて黙って失敗していた:
--   - 監査ログ logCertificateAction / logAuditEvent
--     (certificate_viewed, member_added, reservation_created ほか多数)
--   - AI 監査 logAiAuditEvent (ai_settings_changed ほか ai_*)
--   - NexPTG 同期 (thickness_measurement)
--   - 作業進捗の顧客公開 (progress_update)
-- リポジトリ定義（自由テキスト）に合わせて制約を削除する。
-- =============================================================

alter table vehicle_histories drop constraint if exists vehicle_histories_type_check;
