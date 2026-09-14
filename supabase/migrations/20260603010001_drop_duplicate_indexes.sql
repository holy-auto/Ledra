-- 【後から内容だけ修正】このファイルは本番へ適用済み（版番号は変えていない）。
-- **CONCURRENTLY を外した。** Supabase のブランチ機能はマイグレーションの複数文を
-- パイプラインで送るため、2文目以降の CONCURRENTLY が
-- `CREATE INDEX CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)`
-- で落ちる。CONCURRENTLY が要るのは「書き込みが走っている本番のテーブルをロックしない」
-- ためで、このファイルは本番では再適用されず、空 DB では対象テーブルが空なので
-- ロックの問題は起きない。
-- 新しいファイルで CONCURRENTLY を使うときは **1ファイル1文** にすること
-- （`npm run lint:migrations` の concurrently-in-multi-statement-file が見ている）。
-- =============================================================
-- 重複インデックスの整理 (Drop duplicate indexes)
-- Resolves Supabase performance advisor lint 0009_duplicate_index (8 of 9 findings).
-- 各ペアは pg_get_indexdef で定義が完全一致することを確認済み。冗長な1本を削除し、
-- 書き込み増幅とディスク使用を削減する。
--
-- 各 drop について「残す側 (keep) が repo マイグレーションでも fresh 環境に存在する」ことを
-- 確認済み。残す側が本番のみのドリフトで repo に無い場合、その drop は fresh で唯一の
-- インデックス/一意性を消すため対象から除外する（下記 job_orders を参照）。
-- keep が *_key 制約の場合は inline UNIQUE / PK 宣言で fresh でも自動生成される。
-- drop 側が本番のみ（repo に無い）の場合は fresh では IF EXISTS で no-op になり安全。
--
-- 元は CONCURRENTLY のためトランザクションで囲んでいなかった（2026-09-04 に CONCURRENTLY を外した。冒頭の注を参照）。
-- IF EXISTS で再実行安全。
-- docs/operations/zero-downtime-migrations.md 準拠。
--
--   keep / drop（drop 側を本ファイルで削除）:
--     insurer_tenant_access   : keep idx_insurer_tenant_access_active / drop idx_ita_insurer
--     insurer_users (user_id) : keep idx_iu_user                      / drop insurer_users_user_idx
--     insurer_users (uniq)    : keep insurer_users_insurer_id_user_id_key (inline UNIQUE) / drop insurer_users_insurer_user_unique
--     insurers                : keep idx_insurers_slug                / drop insurers_slug_idx
--     passport_referral_leads : keep passport_referral_leads_lead_token_key (inline UNIQUE) / drop idx_passport_referral_leads_token
--     reservations            : keep idx_reservations_tenant_date_status / drop idx_reservations_tenant_scheduled
--     vehicles (plate_hash)   : keep idx_vehicles_plate_hash          / drop vehicles_plate_hash_idx
--     vehicles (public_id)    : keep vehicles_public_id_uidx          / drop vehicles_public_id_ux
--
--   ※ job_orders は除外: fresh では公開ID一意性が idx_job_orders_public_id (UNIQUE index) のみで
--      担保されており job_orders_public_id_key 制約は repo に存在しない（本番のみのドリフト）。
--      これを drop すると fresh/staging で public_id の一意性が失われるため対象外とした。
--      本番側の重複（制約 vs index）は別途専用 migration で安全に解消する。
-- =============================================================

drop index if exists public.idx_ita_insurer;
drop index if exists public.insurer_users_user_idx;
drop index if exists public.insurer_users_insurer_user_unique;
drop index if exists public.insurers_slug_idx;
drop index if exists public.idx_passport_referral_leads_token;
drop index if exists public.idx_reservations_tenant_scheduled;
drop index if exists public.vehicles_plate_hash_idx;
drop index if exists public.vehicles_public_id_ux;
