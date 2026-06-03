-- =============================================================
-- 重複インデックスの整理 (Drop duplicate indexes)
-- Resolves Supabase performance advisor lint 0009_duplicate_index (9 findings).
-- 各ペアは pg_get_indexdef で定義が完全一致することを確認済み。冗長な1本を削除し、
-- 書き込み増幅とディスク使用を削減する。
--
-- 削除対象はいずれも「制約 (UNIQUE/PK) に紐付かない」インデックスであることを
-- pg_constraint.conindid で確認済み（制約を裏付けるインデックスは DROP INDEX 不可）。
-- UNIQUE ペア (insurer_users / job_orders / passport_referral_leads) では、
-- 制約由来の *_key を残し、重複して手で作られた側を削除する。
--
-- CONCURRENTLY を使うため本ファイルはトランザクションで囲まない（Supabase ランナーは
-- 各ステートメントを auto-commit する）。IF EXISTS で再実行安全。
-- docs/operations/zero-downtime-migrations.md 準拠。
--
--   keep / drop（drop 側を本ファイルで削除）:
--     insurer_tenant_access   : keep idx_insurer_tenant_access_active / drop idx_ita_insurer
--     insurer_users (user_id) : keep idx_iu_user                      / drop insurer_users_user_idx
--     insurer_users (uniq)    : keep insurer_users_insurer_id_user_id_key (制約) / drop insurer_users_insurer_user_unique
--     insurers                : keep idx_insurers_slug                / drop insurers_slug_idx
--     job_orders              : keep job_orders_public_id_key (制約)   / drop idx_job_orders_public_id
--     passport_referral_leads : keep passport_referral_leads_lead_token_key (制約) / drop idx_passport_referral_leads_token
--     reservations            : keep idx_reservations_tenant_date_status / drop idx_reservations_tenant_scheduled
--     vehicles (plate_hash)   : keep idx_vehicles_plate_hash          / drop vehicles_plate_hash_idx
--     vehicles (public_id)    : keep vehicles_public_id_uidx          / drop vehicles_public_id_ux
-- =============================================================

drop index concurrently if exists public.idx_ita_insurer;
drop index concurrently if exists public.insurer_users_user_idx;
drop index concurrently if exists public.insurer_users_insurer_user_unique;
drop index concurrently if exists public.insurers_slug_idx;
drop index concurrently if exists public.idx_job_orders_public_id;
drop index concurrently if exists public.idx_passport_referral_leads_token;
drop index concurrently if exists public.idx_reservations_tenant_scheduled;
drop index concurrently if exists public.vehicles_plate_hash_idx;
drop index concurrently if exists public.vehicles_public_id_ux;
