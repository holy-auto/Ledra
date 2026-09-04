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
-- 外部キー カバリングインデックス一括追加
-- Foreign-key covering indexes (Supabase performance advisor lint
-- 0001_unindexed_foreign_keys。本番 advisor は 146 件、うち 135 件を本ファイルで被覆。
-- 残り（後述の live-only ドリフトテーブル分 10 件）は repo へテーブル定義を取り込んだ後に追加）.
--
-- なぜ: インデックスのない外部キーは (1) 親テーブルの DELETE/UPDATE 時に
--   子テーブルをシーケンシャルスキャン＋ロックし、(2) 当該カラムでの
--   JOIN/絞り込みを遅くする。全件 IF NOT EXISTS で冪等。
--
-- 注: 単一カラム最小構成（FK 被覆目的）。tenant_id 先頭の複合インデックスが
--   既に存在するテーブルは対象外（被覆済みのため）。
-- 注: 本リストは本番 DB の advisor 出力（live catalog）から生成している。一部の FK は
--   repo マイグレーションでは別名/部分インデックスで既に被覆されているが本番ではドリフトで
--   欠けている。その場合は repo の canonical 名で再作成し、両環境を収束させる
--   （fresh では IF NOT EXISTS でスキップ、本番では作成）。下記 store_status / templates_tenant
--   / vh_cert / vehicles_customer_id_fk がこのケース。
-- 注: 本番にのみ存在し repo に CREATE TABLE が無い「ドリフト」テーブル
--   （certificate_maintenance_logs / deals / inquiry_messages / line_link_audit_logs /
--   line_link_candidates / line_link_sessions / line_link_tokens / support_tickets /
--   support_ticket_messages）への FK インデックス（10 件）は本ファイルから除外した。含めると
--   fresh（repo から構築した DB / supabase db reset / preview branch）への適用が
--   "relation does not exist" で失敗するため。当時は CONCURRENTLY を使っており
--   to_regclass ガード（DO ブロック=トランザクション）と併用できなかった。
--   テーブル定義を repo に取り込む別 PR の後に被覆する。
-- 注: 元は CONCURRENTLY のためトランザクションで囲んでいなかった（2026-09-04 に CONCURRENTLY を外した。冒頭の注を参照）。
--   1ファイルに複数の CONCURRENTLY を並べていたのがそもそもの誤りで、Supabase の
--   ブランチ機能はこれをパイプラインで送るため 2 文目以降が SQLSTATE 25001 で落ちた。
--   IF NOT EXISTS で再実行安全。docs/operations/zero-downtime-migrations.md 準拠。
-- 出典: pg_constraint/pg_index を直接照合して被覆漏れ FK を抽出（読み取り専用）。
-- =============================================================

create index if not exists idx_academy_cases_certificate_id on public.academy_cases (certificate_id);

create index if not exists idx_accounting_integrations_connected_by on public.accounting_integrations (connected_by);

create index if not exists idx_accounting_sync_runs_triggered_by on public.accounting_sync_runs (triggered_by);

create index if not exists idx_agent_announcement_reads_user_id on public.agent_announcement_reads (user_id);

create index if not exists idx_agent_announcements_created_by on public.agent_announcements (created_by);

create index if not exists idx_agent_applications_agent_id on public.agent_applications (agent_id);
create index if not exists idx_agent_applications_reviewed_by on public.agent_applications (reviewed_by);

create index if not exists idx_agent_campaign_agents_agent_id on public.agent_campaign_agents (agent_id);

create index if not exists idx_agent_commissions_tenant_id on public.agent_commissions (tenant_id);

create index if not exists idx_agent_invoice_lines_referral_id on public.agent_invoice_lines (referral_id);

create index if not exists idx_agent_material_downloads_user_id on public.agent_material_downloads (user_id);

create index if not exists idx_agent_materials_uploaded_by on public.agent_materials (uploaded_by);

create index if not exists idx_agent_referral_links_created_by on public.agent_referral_links (created_by);

create index if not exists idx_agent_shared_files_uploaded_by on public.agent_shared_files (uploaded_by);

create index if not exists idx_agent_signing_requests_requested_by on public.agent_signing_requests (requested_by);

create index if not exists idx_agent_support_tickets_user_id on public.agent_support_tickets (user_id);

create index if not exists idx_agent_ticket_messages_sender_id on public.agent_ticket_messages (sender_id);

create index if not exists idx_ai_usage_logs_user_id on public.ai_usage_logs (user_id);

create index if not exists idx_cert_idempotency_keys_certificate_id on public.cert_idempotency_keys (certificate_id);

create index if not exists idx_certificate_edit_histories_edited_by on public.certificate_edit_histories (edited_by);

create index if not exists idx_certificate_images_annotated_by on public.certificate_images (annotated_by);

create index if not exists idx_certificates_manufacturer_template_id on public.certificates (manufacturer_template_id);
create index if not exists idx_certificates_parent_certificate_id on public.certificates (parent_certificate_id);
create index if not exists idx_certificates_payment_id on public.certificates (payment_id);
create index if not exists idx_certificates_store_id on public.certificates (store_id);

create index if not exists idx_chat_messages_sender_tenant_id on public.chat_messages (sender_tenant_id);
create index if not exists idx_chat_messages_sender_user_id on public.chat_messages (sender_user_id);

create index if not exists idx_customer_deletion_requests_customer_id on public.customer_deletion_requests (customer_id);

create index if not exists idx_customer_inquiries_replied_by on public.customer_inquiries (replied_by);

create index if not exists idx_customer_intake_invitations_approved_by on public.customer_intake_invitations (approved_by);
create index if not exists idx_customer_intake_invitations_completed_customer_id on public.customer_intake_invitations (completed_customer_id);
create index if not exists idx_customer_intake_invitations_created_by on public.customer_intake_invitations (created_by);
create index if not exists idx_customer_intake_invitations_store_id on public.customer_intake_invitations (store_id);

create index if not exists idx_customer_messages_customer_id on public.customer_messages (customer_id);
create index if not exists idx_customer_messages_sent_by on public.customer_messages (sent_by);

create index if not exists idx_customer_sessions_customer_id on public.customer_sessions (customer_id);

create index if not exists idx_delivery_receipts_created_by on public.delivery_receipts (created_by);

create index if not exists idx_documents_counterparty_tenant_id on public.documents (counterparty_tenant_id);
create index if not exists idx_documents_source_document_id on public.documents (source_document_id);
create index if not exists idx_documents_template_id on public.documents (template_id);
create index if not exists idx_documents_vehicle_id on public.documents (vehicle_id);

create index if not exists idx_gcal_sync_log_reservation_id on public.gcal_sync_log (reservation_id);

create index if not exists idx_insurer_access_logs_insurer_user_id on public.insurer_access_logs (insurer_user_id);

create index if not exists idx_insurer_assignment_rules_assign_to on public.insurer_assignment_rules (assign_to);

create index if not exists idx_insurer_case_attachments_case_id on public.insurer_case_attachments (case_id);
create index if not exists idx_insurer_case_attachments_message_id on public.insurer_case_attachments (message_id);
create index if not exists idx_insurer_case_attachments_uploaded_by on public.insurer_case_attachments (uploaded_by);

create index if not exists idx_insurer_case_messages_sender_id on public.insurer_case_messages (sender_id);

create index if not exists idx_insurer_case_templates_created_by on public.insurer_case_templates (created_by);

create index if not exists idx_insurer_cases_assigned_to on public.insurer_cases (assigned_to);
create index if not exists idx_insurer_cases_certificate_id on public.insurer_cases (certificate_id);
create index if not exists idx_insurer_cases_created_by on public.insurer_cases (created_by);
create index if not exists idx_insurer_cases_tenant_id on public.insurer_cases (tenant_id);
create index if not exists idx_insurer_cases_vehicle_id on public.insurer_cases (vehicle_id);

create index if not exists idx_insurer_notifications_user_id on public.insurer_notifications (user_id);

create index if not exists idx_insurer_saved_searches_insurer_id on public.insurer_saved_searches (insurer_id);

create index if not exists idx_insurer_security_settings_updated_by on public.insurer_security_settings (updated_by);

create index if not exists idx_insurer_sla_config_updated_by on public.insurer_sla_config (updated_by);

create index if not exists idx_insurer_tenant_access_granted_by on public.insurer_tenant_access (granted_by);

create index if not exists idx_insurer_user_preferences_user_id on public.insurer_user_preferences (user_id);

create index if not exists idx_inventory_items_supplier_id on public.inventory_items (supplier_id);
create index if not exists idx_inventory_items_supply_partner_product_id on public.inventory_items (supply_partner_product_id);

create index if not exists idx_inventory_movements_created_by on public.inventory_movements (created_by);
create index if not exists idx_inventory_movements_installation_id on public.inventory_movements (installation_id);
create index if not exists idx_inventory_movements_reservation_id on public.inventory_movements (reservation_id);

create index if not exists idx_job_orders_cancelled_by on public.job_orders (cancelled_by);

create index if not exists idx_manufacturer_certified_tenants_certified_by on public.manufacturer_certified_tenants (certified_by);
create index if not exists idx_manufacturer_certified_tenants_revoked_by on public.manufacturer_certified_tenants (revoked_by);

create index if not exists idx_manufacturer_memberships_invited_by on public.manufacturer_memberships (invited_by);

create index if not exists idx_manufacturers_created_by on public.manufacturers (created_by);

create index if not exists idx_market_deals_buyer_tenant_id on public.market_deals (buyer_tenant_id);
create index if not exists idx_market_deals_inquiry_id on public.market_deals (inquiry_id);

create index if not exists idx_market_inquiries_buyer_tenant_id on public.market_inquiries (buyer_tenant_id);

create index if not exists idx_market_inquiry_messages_sender_tenant_id on public.market_inquiry_messages (sender_tenant_id);

create index if not exists idx_market_vehicle_images_tenant_id on public.market_vehicle_images (tenant_id);

create index if not exists idx_market_vehicles_store_id on public.market_vehicles (store_id);

create index if not exists idx_marketing_leads_assigned_to on public.marketing_leads (assigned_to);

create index if not exists idx_notifications_job_order_id on public.notifications (job_order_id);

create index if not exists idx_order_audit_log_actor_tenant_id on public.order_audit_log (actor_tenant_id);
create index if not exists idx_order_audit_log_actor_user_id on public.order_audit_log (actor_user_id);

create index if not exists idx_order_reviews_reviewer_tenant_id on public.order_reviews (reviewer_tenant_id);

create index if not exists idx_part_confirmation_signatures_witness_staff_id on public.part_confirmation_signatures (witness_staff_id);

create index if not exists idx_part_installation_evidence_tenant_id on public.part_installation_evidence (tenant_id);

create index if not exists idx_part_installations_confirmation_signature_id on public.part_installations (confirmation_signature_id);
create index if not exists idx_part_installations_installed_by on public.part_installations (installed_by);
create index if not exists idx_part_installations_inventory_item_id on public.part_installations (inventory_item_id);
create index if not exists idx_part_installations_reservation_id on public.part_installations (reservation_id);
create index if not exists idx_part_installations_voided_by on public.part_installations (voided_by);

create index if not exists idx_part_serial_registry_consumed_by_tenant_id on public.part_serial_registry (consumed_by_tenant_id);
create index if not exists idx_part_serial_registry_installation_id on public.part_serial_registry (installation_id);

create index if not exists idx_passport_ownership_transfers_initiated_by_user_id on public.passport_ownership_transfers (initiated_by_user_id);
create index if not exists idx_passport_ownership_transfers_initiating_vehicle_id on public.passport_ownership_transfers (initiating_vehicle_id);

create index if not exists idx_passport_referral_leads_api_key_id on public.passport_referral_leads (api_key_id);

create index if not exists idx_payments_created_by on public.payments (created_by);
create index if not exists idx_payments_register_session_id on public.payments (register_session_id);

create index if not exists idx_pii_disclosure_consents_insurer_requested_by on public.pii_disclosure_consents (insurer_requested_by);
create index if not exists idx_pii_disclosure_consents_revoked_by on public.pii_disclosure_consents (revoked_by);
create index if not exists idx_pii_disclosure_consents_tenant_consented_by on public.pii_disclosure_consents (tenant_consented_by);

create index if not exists idx_purchase_order_items_item_id on public.purchase_order_items (item_id);

create index if not exists idx_purchase_orders_approved_by on public.purchase_orders (approved_by);
create index if not exists idx_purchase_orders_created_by on public.purchase_orders (created_by);
create index if not exists idx_purchase_orders_supply_partner_id on public.purchase_orders (supply_partner_id);

create index if not exists idx_register_sessions_closed_by on public.register_sessions (closed_by);
create index if not exists idx_register_sessions_opened_by on public.register_sessions (opened_by);

create index if not exists idx_reservation_step_logs_completed_by on public.reservation_step_logs (completed_by);

create index if not exists idx_reservations_ai_certificate_id on public.reservations (ai_certificate_id);
create index if not exists idx_reservations_assigned_user_id on public.reservations (assigned_user_id);
create index if not exists idx_reservations_payment_id on public.reservations (payment_id);
-- store_id は repo の idx_reservations_store_status (store_id, status) WHERE store_id IS NOT NULL
-- が先頭カラムで FK を被覆する（advisor は partial index も被覆扱い）。本番はこの index を欠く
-- ため canonical 名で再作成して環境差を収束させる（fresh では IF NOT EXISTS でスキップ）。
create index if not exists idx_reservations_store_status on public.reservations (store_id, status) where store_id is not null;

create index if not exists idx_service_packages_recommended_template_id on public.service_packages (recommended_template_id);

create index if not exists idx_shop_announcements_created_by on public.shop_announcements (created_by);
create index if not exists idx_shop_announcements_tenant_id on public.shop_announcements (tenant_id);

create index if not exists idx_shop_order_items_product_id on public.shop_order_items (product_id);

create index if not exists idx_shop_orders_created_by on public.shop_orders (created_by);

create index if not exists idx_signature_reviews_customer_id on public.signature_reviews (customer_id);

create index if not exists idx_signature_sessions_created_by on public.signature_sessions (created_by);

create index if not exists idx_square_connections_connected_by on public.square_connections (connected_by);

create index if not exists idx_square_orders_certificate_id on public.square_orders (certificate_id);
create index if not exists idx_square_orders_vehicle_id on public.square_orders (vehicle_id);

create index if not exists idx_square_sync_runs_triggered_by on public.square_sync_runs (triggered_by);

create index if not exists idx_store_memberships_tenant_id on public.store_memberships (tenant_id);

create index if not exists idx_template_orders_template_config_id on public.template_orders (template_config_id);

-- repo の core_tables が idx_templates_tenant (tenant_id) を作成済み。本番はドリフトで欠く
-- ため canonical 名で再作成（fresh では IF NOT EXISTS でスキップ、byte-identical 重複を防ぐ）。
create index if not exists idx_templates_tenant on public.templates (tenant_id);

create index if not exists idx_tenant_ai_automation_settings_updated_by on public.tenant_ai_automation_settings (updated_by);

create index if not exists idx_tenant_api_keys_created_by on public.tenant_api_keys (created_by);

create index if not exists idx_tenant_feature_settings_updated_by on public.tenant_feature_settings (updated_by);

create index if not exists idx_tenant_option_subscriptions_template_config_id on public.tenant_option_subscriptions (template_config_id);

create index if not exists idx_tenant_supply_auto_send_settings_updated_by on public.tenant_supply_auto_send_settings (updated_by);

create index if not exists idx_tenant_template_configs_platform_template_id on public.tenant_template_configs (platform_template_id);

create index if not exists idx_tenants_default_template_id on public.tenants (default_template_id);

create index if not exists idx_thickness_reports_reservation_id on public.thickness_reports (reservation_id);

create index if not exists idx_thickness_tires_tenant_id on public.thickness_tires (tenant_id);

create index if not exists idx_user_feature_prefs_user_id on public.user_feature_prefs (user_id);

-- repo の core_tables が idx_vh_cert (certificate_id) WHERE certificate_id IS NOT NULL を作成済み
-- （advisor は partial も被覆扱い）。本番はドリフトで欠くため canonical 名で再作成。
create index if not exists idx_vh_cert on public.vehicle_histories (certificate_id) where certificate_id is not null;

-- vehicles.customer_id: 既存 idx_vehicles_customer_id は (tenant_id, customer_id) で customer_id が
-- 先頭でないため FK 未被覆。同名 IF NOT EXISTS だと既存にヒットしてスキップされ被覆漏れになるので、
-- 衝突しない別名で (customer_id) を作成する。
create index if not exists idx_vehicles_customer_id_fk on public.vehicles (customer_id);
