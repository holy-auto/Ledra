SET local check_function_bodies = off;

REVOKE ALL ON TABLE "public"."audit_logs" FROM "anon";

REVOKE ALL ON TABLE "public"."audit_logs" FROM "authenticated";

COMMENT ON COLUMN "public"."ai_translation_cache"."hit_count" IS NULL;

COMMENT ON COLUMN "public"."cert_idempotency_keys"."expires_at" IS NULL;

COMMENT ON COLUMN "public"."certificates"."delivery_acknowledged_at" IS NULL;

COMMENT ON COLUMN "public"."customer_ai_summaries"."signals_hash" IS NULL;

COMMENT ON COLUMN "public"."customer_ai_summaries"."summary" IS NULL;

COMMENT ON COLUMN "public"."delivery_receipts"."anchor_tx_hash" IS NULL;

COMMENT ON COLUMN "public"."delivery_receipts"."receipt_payload_json" IS NULL;

COMMENT ON COLUMN "public"."part_installations"."status" IS NULL;

COMMENT ON COLUMN "public"."signature_sessions"."consent_text_hash" IS NULL;

COMMENT ON COLUMN "public"."signature_sessions"."consent_version" IS NULL;

COMMENT ON COLUMN "public"."signature_sessions"."phone_last4_hash" IS NULL;

COMMENT ON COLUMN "public"."signature_sessions"."secondary_factor_required" IS NULL;

COMMENT ON COLUMN "public"."signature_sessions"."secondary_factor_verified" IS NULL;

COMMENT ON COLUMN "public"."vehicle_inspection_findings"."finding_code" IS NULL;

COMMENT ON COLUMN "public"."vehicle_part_replacements"."next_replacement_mileage_est" IS NULL;

COMMENT ON COLUMN "public"."vehicles"."ml_training_opt_in" IS NULL;

COMMENT ON TABLE "public"."ai_translation_cache" IS NULL;

COMMENT ON TABLE "public"."cert_idempotency_keys" IS NULL;

COMMENT ON TABLE "public"."delivery_receipts" IS NULL;

COMMENT ON TABLE "public"."vehicle_inspection_findings" IS NULL;

COMMENT ON TABLE "public"."vehicle_mileage_logs" IS NULL;

COMMENT ON TABLE "public"."vehicle_part_replacements" IS NULL;

DROP EVENT TRIGGER "ensure_rls";

DROP POLICY "rewards_select_tenant_admin" ON "public"."academy_creator_rewards";

DROP POLICY "academy_lessons_delete_author" ON "public"."academy_lessons";

DROP POLICY "academy_lessons_insert" ON "public"."academy_lessons";

DROP POLICY "academy_lessons_select_own_tenant" ON "public"."academy_lessons";

DROP POLICY "academy_lessons_update_author" ON "public"."academy_lessons";

DROP POLICY "academy_quiz_questions_select_author" ON "public"."academy_quiz_questions";

DROP POLICY "academy_quiz_questions_write_author" ON "public"."academy_quiz_questions";

DROP POLICY "aal_select_platform_admin" ON "public"."admin_audit_logs";

DROP POLICY "audit_logs_tenant_insert" ON "public"."audit_logs";

DROP POLICY "audit_logs_tenant_read" ON "public"."audit_logs";

DROP POLICY "public_insert" ON "public"."customer_inquiries";

DROP POLICY "tenant_admins_delete" ON "public"."customer_inquiries";

DROP POLICY "tenant_members_select" ON "public"."customer_inquiries";

DROP POLICY "tenant_members_update" ON "public"."customer_inquiries";

DROP POLICY "ft_agreements_tenant_select" ON "public"."ft_agreements";

DROP POLICY "ft_agreements_tenant_update" ON "public"."ft_agreements";

DROP POLICY "ft_applications_tenant_insert" ON "public"."ft_applications";

DROP POLICY "ft_applications_tenant_select" ON "public"."ft_applications";

DROP POLICY "ft_applications_tenant_update" ON "public"."ft_applications";

DROP POLICY "ft_condition_checks_tenant_insert" ON "public"."ft_condition_checks";

DROP POLICY "ft_condition_checks_tenant_select" ON "public"."ft_condition_checks";

DROP POLICY "ft_conditions_tenant_select" ON "public"."ft_conditions";

DROP POLICY "ft_defects_tenant_select" ON "public"."ft_defects";

DROP POLICY "ft_evidence_tenant_insert" ON "public"."ft_evidence";

DROP POLICY "ft_evidence_tenant_select" ON "public"."ft_evidence";

DROP POLICY "ft_inspections_tenant_select" ON "public"."ft_inspections";

DROP POLICY "ft_jobs_tenant_select" ON "public"."ft_jobs";

DROP POLICY "ft_jobs_tenant_update" ON "public"."ft_jobs";

DROP POLICY "ft_recruitments_tenant_select" ON "public"."ft_recruitments";

DROP POLICY "ft_training_completions_tenant_insert" ON "public"."ft_training_completions";

DROP POLICY "ft_training_completions_tenant_select" ON "public"."ft_training_completions";

DROP POLICY "ft_training_modules_tenant_select" ON "public"."ft_training_modules";

DROP POLICY "owner can add organization members" ON "public"."organization_members";

DROP POLICY "reservations_insert_v2" ON "public"."reservations";

DROP POLICY "reservations_update_v2" ON "public"."reservations";

DROP POLICY "tenant_memberships_insert_v2" ON "public"."tenant_memberships";

DROP POLICY "tenant_memberships_update_v2" ON "public"."tenant_memberships";

DROP TRIGGER "trg_set_case_number" ON "public"."insurer_cases";

DROP TRIGGER "trg_job_orders_updated_at" ON "public"."job_orders";

DROP TRIGGER "trg_nfc_updated_at" ON "public"."nfc_tags";

DROP TRIGGER "trg_templates_updated_at" ON "public"."templates";

DROP TRIGGER "trg_tm_updated_at" ON "public"."tenant_memberships";

DROP TRIGGER "trg_tenants_updated_at" ON "public"."tenants";

DROP TRIGGER "trg_vehicles_updated_at" ON "public"."vehicles";

DROP INDEX "public"."idx_audit_logs_record";

DROP INDEX "public"."idx_audit_logs_tenant_performed";

DROP INDEX "public"."idx_audit_logs_tenant";

DROP INDEX "public"."idx_certificate_images_cert_sort";

DROP INDEX "public"."idx_certificates_public_id";

DROP INDEX "public"."idx_certificates_tenant_status";

DROP INDEX "public"."idx_certificates_vehicle";

DROP INDEX "public"."idx_certimg_cert";

DROP INDEX "public"."idx_certs_public_id";

DROP INDEX "public"."idx_certs_status";

DROP INDEX "public"."idx_certs_tenant";

DROP INDEX "public"."idx_certs_vehicle";

DROP INDEX "public"."idx_customer_inquiries_customer";

DROP INDEX "public"."idx_customer_inquiries_tenant";

DROP INDEX "public"."idx_customers_tenant_email";

DROP INDEX "public"."idx_customers_tenant_line";

DROP INDEX "public"."idx_ial_cert";

DROP INDEX "public"."idx_ial_insurer";

DROP INDEX "public"."idx_market_vehicles_tenant_created";

DROP INDEX "public"."idx_nfc_active_certificate";

DROP INDEX "public"."idx_nfc_tag_code";

DROP INDEX "public"."idx_nfc_tags_certificate";

DROP INDEX "public"."idx_nfc_tags_cert";

DROP INDEX "public"."idx_nfc_tenant";

DROP INDEX "public"."idx_nfc_vehicle";

DROP INDEX "public"."idx_payments_idempotency";

DROP INDEX "public"."idx_reservations_assigned_user";

DROP INDEX "public"."idx_reservations_date_tenant";

DROP INDEX "public"."idx_reservations_source";

DROP INDEX "public"."idx_tenants_slug";

DROP INDEX "public"."idx_tenants_stripe_customer";

DROP INDEX "public"."idx_tm_tenant";

DROP INDEX "public"."idx_tm_user";

DROP INDEX "public"."idx_vehicle_histories_vehicle";

DROP INDEX "public"."idx_vehicles_plate";

DROP INDEX "public"."idx_vehicles_tenant";

DROP INDEX "public"."idx_vh_tenant";

DROP INDEX "public"."idx_vh_vehicle";

DROP VIEW "public"."certificates_public";

DROP VIEW "public"."invoices";

ALTER TABLE "public"."audit_logs"
  DROP CONSTRAINT "audit_logs_performed_by_fkey";

ALTER TABLE "public"."audit_logs"
  DROP CONSTRAINT "audit_logs_tenant_id_fkey";

ALTER TABLE "public"."certificates"
  DROP CONSTRAINT "certificates_created_by_fkey";

ALTER TABLE "public"."certificates"
  DROP CONSTRAINT "certificates_status_check";

ALTER TABLE "public"."insurer_users"
  DROP CONSTRAINT "insurer_users_user_id_fkey";

ALTER TABLE "public"."insurers"
  DROP CONSTRAINT "insurers_plan_tier_check";

ALTER TABLE "public"."job_orders"
  DROP CONSTRAINT "job_orders_from_tenant_id_fkey";

ALTER TABLE "public"."job_orders"
  DROP CONSTRAINT "job_orders_to_tenant_id_fkey";

ALTER TABLE "public"."market_inquiries"
  DROP CONSTRAINT "market_inquiries_buyer_email_format";

ALTER TABLE "public"."market_inquiries"
  DROP CONSTRAINT "market_inquiries_buyer_name_length";

ALTER TABLE "public"."market_inquiries"
  DROP CONSTRAINT "market_inquiries_message_length";

ALTER TABLE "public"."market_inquiry_messages"
  DROP CONSTRAINT "market_inquiry_messages_length";

ALTER TABLE "public"."part_installations"
  DROP CONSTRAINT "part_installations_status_check";

ALTER TABLE "public"."templates"
  DROP CONSTRAINT "templates_shared_is_platform_owned";

ALTER TABLE "public"."tenant_memberships"
  DROP CONSTRAINT "tenant_memberships_role_check";

ALTER TABLE "public"."tenant_memberships"
  DROP CONSTRAINT "tenant_memberships_user_id_fkey";

ALTER TABLE "public"."tenants"
  DROP CONSTRAINT "tenants_plan_tier_check";

ALTER TABLE "public"."workshop_capability_profiles"
  DROP CONSTRAINT "workshop_capability_profiles_tenant_id_fkey";

ALTER TABLE "public"."workshop_capability_profiles"
  DROP CONSTRAINT "workshop_capability_profiles_verified_by_fkey";

ALTER TABLE "public"."certificate_images"
  ALTER COLUMN "file_size" DROP DEFAULT;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "customer_name" DROP DEFAULT;

ALTER TABLE "public"."insurers"
  ALTER COLUMN "plan_tier" DROP DEFAULT;

ALTER TABLE "public"."templates"
  ALTER COLUMN "scope" DROP DEFAULT;

ALTER TABLE "public"."audit_logs"
  DROP COLUMN "device_id";

ALTER TABLE "public"."audit_logs"
  DROP COLUMN "ip_address";

ALTER TABLE "public"."audit_logs"
  DROP COLUMN "new_values";

ALTER TABLE "public"."audit_logs"
  DROP COLUMN "old_values";

ALTER TABLE "public"."audit_logs"
  DROP COLUMN "performed_by";

ALTER TABLE "public"."audit_logs"
  DROP COLUMN "reason";

ALTER TABLE "public"."audit_logs"
  DROP COLUMN "record_id";

ALTER TABLE "public"."audit_logs"
  DROP COLUMN "table_name";

ALTER TABLE "public"."certificates"
  DROP COLUMN "certificate_no";

ALTER TABLE "public"."insurers"
  DROP COLUMN "max_users";

ALTER TABLE "public"."templates"
  DROP COLUMN "updated_at";

ALTER TABLE "public"."tenant_memberships"
  DROP COLUMN "updated_at";

ALTER TABLE "public"."tenants"
  DROP COLUMN "updated_at";

DROP TABLE "public"."workshop_capability_profiles";

ALTER TABLE "public"."agent_signing_requests"
  ADD COLUMN "notified_at" timestamp WITH time zone;

ALTER TABLE "public"."certificate_images"
  ADD COLUMN "created_by" uuid;

ALTER TABLE "public"."certificates"
  ADD COLUMN "template_id" uuid;

ALTER TABLE "public"."documents"
  ADD COLUMN "assigned_user_id" uuid;

ALTER TABLE "public"."insurer_tenant_access"
  ADD COLUMN "is_enabled" boolean NOT NULL DEFAULT true;

ALTER TABLE "public"."insurer_users"
  ADD COLUMN "email" text;

ALTER TABLE "public"."insurer_users"
  ADD COLUMN "created_by" uuid;

ALTER TABLE "public"."insurer_users"
  ADD COLUMN "note" text;

ALTER TABLE "public"."job_orders"
  ADD COLUMN "prefecture" text;

ALTER TABLE "public"."signature_sessions"
  ADD COLUMN "customer_id" uuid;

ALTER TABLE "public"."signature_sessions"
  ADD COLUMN "line_user_id" text;

ALTER TABLE "public"."tenants"
  ADD COLUMN "current_period_end" timestamp WITH time zone;

ALTER TABLE "public"."vehicles"
  ADD COLUMN "plate_hash" text;

ALTER TABLE "public"."audit_logs"
  ALTER COLUMN "tenant_id" DROP NOT NULL;

ALTER TABLE "public"."certificate_images"
  ALTER COLUMN "content_type" SET NOT NULL;

ALTER TABLE "public"."certificate_images"
  ALTER COLUMN "file_name" SET NOT NULL;

ALTER TABLE "public"."certificate_images"
  ALTER COLUMN "file_size" SET NOT NULL;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "content_preset_json" SET NOT NULL;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "current_version" SET NOT NULL;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "expiry_type" SET NOT NULL;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "expiry_type" DROP DEFAULT;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "expiry_type" TYPE public.expiry_type_enum USING "expiry_type"::public.expiry_type_enum;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "expiry_type" SET DEFAULT 'text'::public.expiry_type_enum;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "footer_variant" SET NOT NULL;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "status" TYPE public.certificate_status_enum USING "status"::public.certificate_status_enum;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "status" SET DEFAULT 'active'::public.certificate_status_enum;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "vehicle_info_json" SET NOT NULL;

ALTER TABLE "public"."insurer_access_logs"
  ALTER COLUMN "meta" SET NOT NULL;

ALTER TABLE "public"."insurers"
  ALTER COLUMN "plan_tier" DROP NOT NULL;

ALTER TABLE "public"."insurers"
  ALTER COLUMN "slug" SET NOT NULL;

ALTER TABLE "public"."reservations"
  ALTER COLUMN "source" SET NOT NULL;

ALTER TABLE "public"."templates"
  ALTER COLUMN "scope" DROP DEFAULT;

ALTER TABLE "public"."templates"
  ALTER COLUMN "scope" TYPE public.template_scope_enum USING "scope"::public.template_scope_enum;

DROP TRIGGER IF EXISTS "trg_block_end_user_super_admin_assignment"
ON "public"."tenant_memberships";

ALTER TABLE "public"."tenant_memberships"
  ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "public"."tenant_memberships"
  ALTER COLUMN "role" TYPE public.membership_role_enum USING "role"::public.membership_role_enum;

ALTER TABLE "public"."tenant_memberships"
  ALTER COLUMN "role" SET DEFAULT 'viewer'::public.membership_role_enum;

CREATE TRIGGER "trg_block_end_user_super_admin_assignment"
  BEFORE INSERT OR UPDATE OF role
  ON "public"."tenant_memberships"
  FOR EACH ROW
  EXECUTE FUNCTION public.block_end_user_super_admin_assignment();

ALTER TABLE "public"."tenants"
  ALTER COLUMN "plan_tier" DROP DEFAULT;

ALTER TABLE "public"."tenants"
  ALTER COLUMN "plan_tier" TYPE public.plan_tier_enum USING "plan_tier"::public.plan_tier_enum;

ALTER TABLE "public"."tenants"
  ALTER COLUMN "plan_tier" SET DEFAULT 'free'::public.plan_tier_enum;

ALTER TABLE "public"."tenants"
  ALTER COLUMN "slug" SET NOT NULL;

ALTER TABLE "public"."vehicles"
  ALTER COLUMN "maker" SET NOT NULL;

ALTER TABLE "public"."vehicles"
  ALTER COLUMN "model" SET NOT NULL;

ALTER TABLE "public"."vehicles"
  ALTER COLUMN "public_id" SET NOT NULL;

ALTER TABLE "public"."certificate_images"
  ALTER COLUMN "sort_order" SET DEFAULT 1;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "expiry_type" SET DEFAULT 'text'::public.expiry_type_enum;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "service_type" SET DEFAULT 'coating'::text;

ALTER TABLE "public"."certificates"
  ALTER COLUMN "status" SET DEFAULT 'active'::public.certificate_status_enum;

ALTER TABLE "public"."insurer_users"
  ALTER COLUMN "role" SET DEFAULT 'member'::text;

ALTER TABLE "public"."job_orders"
  ALTER COLUMN "status" SET DEFAULT 'open'::text;

ALTER TABLE "public"."tenant_memberships"
  ALTER COLUMN "role" SET DEFAULT 'viewer'::public.membership_role_enum;

ALTER TABLE "public"."tenants"
  ALTER COLUMN "plan_tier" SET DEFAULT 'free'::public.plan_tier_enum;

CREATE OR REPLACE FUNCTION public.acquire_cron_lock (
  p_task        text,
  p_ttl_seconds integer
)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
DECLARE
  affected int;
BEGIN
  INSERT INTO cron_locks (task, acquired_at, expires_at)
  VALUES (p_task, now(), now() + (p_ttl_seconds::text || ' seconds')::interval)
  ON CONFLICT (task) DO UPDATE
    SET acquired_at = EXCLUDED.acquired_at,
        expires_at = EXCLUDED.expires_at
    WHERE cron_locks.expires_at < now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_inventory_movement (
  p_item_id        uuid,
  p_type           text,
  p_quantity       numeric,
  p_reason         text    DEFAULT NULL::text,
  p_reservation_id uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_item inventory_items%ROWTYPE;
  v_new_stock numeric(12,2);
  v_movement_id uuid;
  v_user_id uuid;
BEGIN
  IF p_type NOT IN ('in', 'out', 'adjust') THEN
    RAISE EXCEPTION 'invalid_type: %', p_type;
  END IF;
  IF p_quantity IS NULL OR p_quantity < 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  -- RLS が自動で tenant を絞るので、ここで取得できれば権限 OK
  SELECT * INTO v_item FROM inventory_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_not_found';
  END IF;

  IF p_type = 'in' THEN
    v_new_stock := v_item.current_stock + p_quantity;
  ELSIF p_type = 'out' THEN
    v_new_stock := v_item.current_stock - p_quantity;
  ELSE  -- adjust
    v_new_stock := p_quantity;
  END IF;

  UPDATE inventory_items
    SET current_stock = v_new_stock
    WHERE id = v_item.id;

  v_user_id := auth.uid();

  INSERT INTO inventory_movements(tenant_id, item_id, type, quantity, reason, reservation_id, created_by)
    VALUES (v_item.tenant_id, v_item.id, p_type, p_quantity, p_reason, p_reservation_id, v_user_id)
    RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'movement_id', v_movement_id,
    'item_id', v_item.id,
    'previous_stock', v_item.current_stock,
    'new_stock', v_new_stock
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.billing_analytics_stats (
  p_tenant_id   uuid,
  p_customer_id uuid DEFAULT NULL::uuid
)
  RETURNS json
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  result json;
  v_today date := current_date;
begin
  with
  month_series as (
    select to_char(gs, 'YYYY-MM') as month_key,
           to_char(gs, 'YYYY') || '年' || extract(month from gs)::int || '月' as label,
           to_char(gs, 'YYYY') as year_key,
           gs::date as month_start
    from generate_series(date_trunc('month', v_today) - interval '11 months', date_trunc('month', v_today), '1 month') gs
  ),
  doc_by_month as (
    select to_char(coalesce(issued_at, created_at::date), 'YYYY-MM') as month_key,
           coalesce(sum(coalesce(total, 0)), 0) as total, count(*) as cnt
    from public.documents
    where tenant_id = p_tenant_id and doc_type in ('invoice', 'consolidated_invoice', 'receipt') and status != 'cancelled'
      and (p_customer_id is null or customer_id = p_customer_id)
    group by 1
  ),
  monthly as (
    select ms.month_key, ms.label, ms.year_key,
           coalesce(dm.total, 0) as combined_total, coalesce(dm.cnt, 0) as count
    from month_series ms left join doc_by_month dm on dm.month_key = ms.month_key
  ),
  months_json as (
    select json_agg(json_build_object('month', month_key, 'label', label, 'invoiceTotal', combined_total, 'documentTotal', 0, 'combinedTotal', combined_total, 'count', count) order by month_key) as data from monthly
  ),
  years_json as (
    select json_agg(json_build_object('year', year_key, 'total', year_total, 'count', year_count) order by year_key) as data
    from (select year_key, sum(combined_total) as year_total, sum(count) as year_count from monthly group by year_key) y
  ),
  week_series as (
    select to_char(gs, 'IYYY-IW') as week_key,
           to_char(gs, 'MM/DD') || '週' as label,
           gs::date as week_start
    from generate_series(date_trunc('week', v_today) - interval '11 weeks', date_trunc('week', v_today), '1 week') gs
  ),
  doc_by_week as (
    select to_char(date_trunc('week', coalesce(issued_at, created_at::date)), 'IYYY-IW') as week_key,
           coalesce(sum(coalesce(total, 0)), 0) as total, count(*) as cnt
    from public.documents
    where tenant_id = p_tenant_id and doc_type in ('invoice', 'consolidated_invoice', 'receipt') and status != 'cancelled'
      and (p_customer_id is null or customer_id = p_customer_id)
      and coalesce(issued_at, created_at::date) >= (date_trunc('week', v_today) - interval '11 weeks')
    group by 1
  ),
  weekly as (
    select ws.week_key, ws.label,
           coalesce(dw.total, 0) as combined_total, coalesce(dw.cnt, 0) as count
    from week_series ws left join doc_by_week dw on dw.week_key = ws.week_key
  ),
  weeks_json as (
    select json_agg(json_build_object('week', week_key, 'label', label, 'combinedTotal', combined_total, 'count', count) order by week_key) as data from weekly
  ),
  current_vals as (
    select coalesce((select combined_total from monthly where month_key = to_char(v_today, 'YYYY-MM')), 0) as cur_total,
           coalesce((select label from monthly where month_key = to_char(v_today, 'YYYY-MM')), '') as cur_label,
           coalesce((select combined_total from monthly where month_key = to_char(v_today - interval '1 month', 'YYYY-MM')), 0) as prev_total,
           coalesce((select label from monthly where month_key = to_char(v_today - interval '1 month', 'YYYY-MM')), '') as prev_label
  ),
  last_year_val as (
    select coalesce(m.combined_total,
      (select coalesce(sum(coalesce(total, 0)), 0) from public.documents where tenant_id = p_tenant_id and doc_type in ('invoice','consolidated_invoice','receipt') and status != 'cancelled'
       and (p_customer_id is null or customer_id = p_customer_id)
       and to_char(coalesce(issued_at, created_at::date), 'YYYY-MM') = to_char(v_today - interval '1 year', 'YYYY-MM'))
    ) as ly_total,
    coalesce(m.label, to_char(v_today - interval '1 year', 'YYYY') || '年' || extract(month from v_today - interval '1 year')::int || '月') as ly_label
    from (select null::bigint as combined_total, null::text as label) dummy
    left join monthly m on m.month_key = to_char(v_today - interval '1 year', 'YYYY-MM')
  ),
  est_pipeline as (
    select coalesce(sum(coalesce(total, 0)), 0) as pipeline
    from public.documents where tenant_id = p_tenant_id and doc_type = 'estimate' and status in ('draft', 'sent')
      and (p_customer_id is null or customer_id = p_customer_id)
  ),
  summary_agg as (
    select coalesce(sum(combined_total), 0) as total_revenue, coalesce(max(combined_total), 1) as max_month_total, coalesce(sum(count), 0) as total_count from monthly
  ),
  customer_totals as (
    select d.customer_id, c.name as customer_name, coalesce(sum(coalesce(d.total, 0)), 0) as total
    from public.documents d
    join public.customers c on c.id = d.customer_id
    where d.tenant_id = p_tenant_id and d.doc_type in ('invoice', 'consolidated_invoice', 'receipt') and d.status != 'cancelled'
      and d.customer_id is not null
    group by d.customer_id, c.name
  ),
  customers_json as (
    select coalesce(json_agg(json_build_object('id', customer_id, 'name', customer_name, 'total', total) order by total desc), '[]'::json) as data
    from customer_totals
  )

  select json_build_object(
    'months', coalesce(mj.data, '[]'::json), 'years', coalesce(yj.data, '[]'::json), 'weeks', coalesce(wj.data, '[]'::json),
    'current', json_build_object('month', cv.cur_total, 'monthLabel', cv.cur_label, 'prevMonth', cv.prev_total, 'prevMonthLabel', cv.prev_label,
      'lastYearSameMonth', lyv.ly_total, 'lastYearLabel', lyv.ly_label,
      'monthGrowthRate', case when cv.prev_total > 0 then round((cv.cur_total - cv.prev_total)::numeric / cv.prev_total::numeric * 100, 2) else null end,
      'yearGrowthRate', case when lyv.ly_total > 0 then round((cv.cur_total - lyv.ly_total)::numeric / lyv.ly_total::numeric * 100, 2) else null end
    ),
    'summary', json_build_object('totalRevenue', sa.total_revenue, 'estimatePipeline', ep.pipeline, 'maxMonthTotal', sa.max_month_total, 'totalCount', sa.total_count),
    'customers', coalesce(cj.data, '[]'::json)
  ) into result
  from months_json mj cross join years_json yj cross join weeks_json wj cross join current_vals cv cross join last_year_val lyv
    cross join est_pipeline ep cross join summary_agg sa cross join customers_json cj;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.calc_size_class_from_volume (
  vol_m3 numeric
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  SELECT CASE
    WHEN vol_m3 IS NULL THEN NULL
    WHEN vol_m3 < 8.0  THEN 'SS'
    WHEN vol_m3 < 10.0 THEN 'S'
    WHEN vol_m3 < 12.0 THEN 'M'
    WHEN vol_m3 < 14.0 THEN 'L'
    WHEN vol_m3 < 16.0 THEN 'LL'
    ELSE 'XL'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.certificate_versions_no_update()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  raise exception 'certificate_versions: 版スナップショットは不変です。更新できません (id=%)', OLD.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.check_reservation_overlap (
  p_tenant_id        uuid,
  p_scheduled_date   date,
  p_start_time       time without time zone,
  p_end_time         time without time zone,
  p_exclude_id       uuid                   DEFAULT NULL::uuid,
  p_assigned_user_id uuid                   DEFAULT NULL::uuid
)
  RETURNS TABLE (
    overlapping_id    uuid,
    overlapping_title text,
    overlapping_start time without time zone,
    overlapping_end   time without time zone
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  return query
  select r.id, r.title, r.start_time, r.end_time
  from reservations r
  where r.tenant_id = p_tenant_id
    and r.scheduled_date = p_scheduled_date
    and r.status not in ('cancelled', 'completed')
    and (
      r.all_day
      or (
        r.start_time is not null
        and r.end_time is not null
        and r.start_time < p_end_time
        and r.end_time > p_start_time
      )
    )
    and (p_exclude_id is null or r.id != p_exclude_id)
    and (p_assigned_user_id is null or r.assigned_user_id = p_assigned_user_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_summary_counts (
  p_tenant_id uuid
)
  RETURNS json
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
  v_now            timestamptz := now();
  v_today          date := v_now::date;
  v_month_start    timestamptz := date_trunc('month', v_now);
  v_next7          date := v_today + INTERVAL '7 days';
  v_next30         date := v_today + INTERVAL '30 days';
  v_week_start     date;
  v_week_end       date;

  v_cert_total       int;
  v_cert_active      int;
  v_cert_void        int;
  v_cert_draft       int;
  v_cert_month       int;
  v_cert_exp7        int;
  v_cert_exp30       int;
  v_cust_total       int;
  v_cust_month       int;
  v_inv_total        int;
  v_res_today        int;
  v_res_week         int;
  v_res_pending      int;
  v_orders_active    int;
  v_orders_done      int;
BEGIN
  -- Week range (Monday → Sunday) matching the existing JS computation.
  v_week_start := v_today - ((EXTRACT(ISODOW FROM v_today)::int - 1) || ' days')::interval;
  v_week_end   := v_week_start + INTERVAL '6 days';

  -- ── Certificates ──
  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'active'),
    count(*) FILTER (WHERE status = 'void'),
    count(*) FILTER (WHERE status = 'draft'),
    count(*) FILTER (WHERE created_at >= v_month_start),
    count(*) FILTER (WHERE status = 'active' AND expiry_date BETWEEN v_today AND v_next7),
    count(*) FILTER (WHERE status = 'active' AND expiry_date BETWEEN v_today AND v_next30)
  INTO v_cert_total, v_cert_active, v_cert_void, v_cert_draft,
       v_cert_month, v_cert_exp7, v_cert_exp30
  FROM public.certificates
  WHERE tenant_id = p_tenant_id;

  -- ── Customers ──
  SELECT
    count(*),
    count(*) FILTER (WHERE created_at >= v_month_start)
  INTO v_cust_total, v_cust_month
  FROM public.customers
  WHERE tenant_id = p_tenant_id;

  -- ── Invoices (doc_type = 'invoice' in documents) ──
  SELECT count(*) INTO v_inv_total
  FROM public.documents
  WHERE tenant_id = p_tenant_id
    AND doc_type = 'invoice';

  -- ── Reservations ──
  SELECT
    count(*) FILTER (WHERE scheduled_date = v_today AND status <> 'cancelled'),
    count(*) FILTER (WHERE scheduled_date BETWEEN v_week_start AND v_week_end AND status <> 'cancelled'),
    count(*) FILTER (WHERE status = 'confirmed')
  INTO v_res_today, v_res_week, v_res_pending
  FROM public.reservations
  WHERE tenant_id = p_tenant_id;

  -- ── Orders (job_orders is many-to-many; either side counts) ──
  SELECT
    count(*) FILTER (
      WHERE status = ANY (ARRAY['pending', 'accepted', 'in_progress', 'approval_pending', 'payment_pending'])
    ),
    count(*) FILTER (WHERE status = 'completed' AND updated_at >= v_month_start)
  INTO v_orders_active, v_orders_done
  FROM public.job_orders
  WHERE from_tenant_id = p_tenant_id OR to_tenant_id = p_tenant_id;

  RETURN json_build_object(
    'certificates', json_build_object(
      'total', v_cert_total,
      'active', v_cert_active,
      'void', v_cert_void,
      'draft', v_cert_draft,
      'thisMonth', v_cert_month
    ),
    'expiring', json_build_object(
      'next7days', v_cert_exp7,
      'next30days', v_cert_exp30
    ),
    'customers', json_build_object(
      'total', v_cust_total,
      'thisMonth', v_cust_month
    ),
    'invoices_total', v_inv_total,
    'reservations', json_build_object(
      'today', v_res_today,
      'thisWeek', v_res_week,
      'pending', v_res_pending
    ),
    'orders', json_build_object(
      'active', v_orders_active,
      'completedThisMonth', v_orders_done
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.estimate_vehicle_size (
  p_maker text,
  p_model text
)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_size text;
BEGIN
  SELECT size_class INTO v_size
  FROM vehicle_size_master
  WHERE maker = p_maker AND model = p_model
  LIMIT 1;
  IF v_size IS NOT NULL THEN RETURN v_size; END IF;

  SELECT size_class INTO v_size
  FROM vehicle_size_master
  WHERE maker = p_maker AND (
    p_model ILIKE '%' || model || '%'
    OR model ILIKE '%' || p_model || '%'
  )
  LIMIT 1;
  RETURN v_size;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_mileage_from_certificate()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
declare
  v_mileage integer;
  v_vehicle_id uuid;
  v_tenant_id uuid;
begin
  v_mileage := (new.maintenance_json->>'mileage')::integer;
  if v_mileage is null or v_mileage <= 0 then
    return new;
  end if;
  v_vehicle_id := new.vehicle_id;
  v_tenant_id  := new.tenant_id;
  if v_vehicle_id is null then
    return new;
  end if;
  insert into vehicle_mileage_logs
    (tenant_id, vehicle_id, certificate_id, mileage_km, recorded_at, source)
  values
    (v_tenant_id, v_vehicle_id, new.id, v_mileage, coalesce(new.created_at, now()), 'maintenance')
  on conflict do nothing;
  return new;
exception
  when others then
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generate_job_order_number()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'ORD-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('job_order_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_agent_status()
  RETURNS TABLE (
    agent_id   uuid,
    status     text,
    role       text,
    agent_name text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
  select
    a.id as agent_id,
    a.status,
    au.role,
    a.name as agent_name
  from agent_users au
  join agents a on a.id = au.agent_id
  where au.user_id = auth.uid()
    and au.is_active = true
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_insurer_status()
  RETURNS TABLE (
    insurer_id     uuid,
    status         text,
    plan_tier      text,
    requested_plan text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  SELECT i.id, i.status, i.plan_tier, i.requested_plan
  FROM public.insurers i
  JOIN public.insurer_users iu ON iu.insurer_id = i.id
  WHERE iu.user_id = auth.uid()
    AND iu.is_active = true
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_user_contexts()
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
  v_user_id      UUID;
  v_has_shop     BOOLEAN := FALSE;
  v_has_agent    BOOLEAN := FALSE;
  v_tenant_id    UUID;
  v_agent_id     UUID;
  v_agent_name   TEXT;
  v_agent_status TEXT;
  v_agent_role   TEXT;
  v_au_agent_id  UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 施工店メンバーシップ確認
  SELECT tenant_id
  INTO v_tenant_id
  FROM public.tenant_memberships
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_tenant_id IS NOT NULL THEN
    v_has_shop := TRUE;
  END IF;

  -- 代理店確認: まず agent_users から agent_id と role を取得
  SELECT agent_id, role
  INTO v_au_agent_id, v_agent_role
  FROM public.agent_users
  WHERE user_id = v_user_id
    AND is_active = true
  LIMIT 1;

  -- 次に agents から詳細を取得
  IF v_au_agent_id IS NOT NULL THEN
    SELECT id, name, status
    INTO v_agent_id, v_agent_name, v_agent_status
    FROM public.agents
    WHERE id = v_au_agent_id
    LIMIT 1;
  END IF;

  IF v_agent_id IS NOT NULL THEN
    v_has_agent := TRUE;
  END IF;

  RETURN json_build_object(
    'has_shop',     v_has_shop,
    'has_agent',    v_has_agent,
    'tenant_id',    v_tenant_id,
    'agent_id',     v_agent_id,
    'agent_name',   v_agent_name,
    'agent_status', v_agent_status,
    'agent_role',   v_agent_role
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_intake_link_usage (
  p_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
  UPDATE public.customer_intake_links
  SET submission_count = submission_count + 1,
      last_used_at = now()
  WHERE id = p_id
    AND is_active = true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_intake_ocr_attempts (
  p_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_next integer;
BEGIN
  UPDATE customer_intake_invitations
  SET ocr_attempts = ocr_attempts + 1
  WHERE id = p_id
    AND status = 'pending'
    AND ocr_attempts < 10
  RETURNING ocr_attempts INTO v_next;

  RETURN v_next IS NOT NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_referral_link_click (
  p_code text
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  update agent_referral_links
     set click_count = coalesce(click_count, 0) + 1,
         updated_at  = now()
   where code = p_code
     and is_active = true;
$function$;

CREATE OR REPLACE FUNCTION public.insurer_audit_log (
  p_action           text,
  p_target_public_id text  DEFAULT NULL::text,
  p_query_json       jsonb DEFAULT NULL::jsonb,
  p_ip               text  DEFAULT NULL::text,
  p_user_agent       text  DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
declare
  v_insurer_user_id uuid;
  v_insurer_id uuid;
  v_cert_id uuid;
begin
  -- Verify caller is an active insurer user
  select iu.id, iu.insurer_id
  into v_insurer_user_id, v_insurer_id
  from insurer_users iu
  where iu.user_id = auth.uid()
    and iu.is_active = true
  limit 1;

  if v_insurer_user_id is null then
    raise exception 'Not an active insurer user';
  end if;

  -- Resolve certificate_id from public_id if provided
  if p_target_public_id is not null then
    select c.id into v_cert_id
    from certificates c
    where c.public_id = p_target_public_id
    limit 1;
  end if;

  insert into insurer_access_logs (insurer_id, insurer_user_id, certificate_id, action, meta, ip, user_agent)
  values (
    v_insurer_id,
    v_insurer_user_id,
    v_cert_id,
    p_action,
    coalesce(p_query_json, '{}'::jsonb),
    p_ip,
    p_user_agent
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.insurer_search_vehicles (
  p_query      text,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0,
  p_status     text    DEFAULT 'all'::text,
  p_ip         text    DEFAULT NULL::text,
  p_user_agent text    DEFAULT NULL::text
)
  RETURNS TABLE (
    vehicle_id                          uuid,
    vehicle_public_id                   text,
    plate_display                       text,
    maker                               text,
    model                               text,
    year_text                           text,
    latest_certificate_public_id        text,
    latest_active_certificate_public_id text,
    latest_certificate_status           text,
    latest_certificate_ts               timestamp with time zone,
    certificate_count                   bigint,
    search_rank                         integer
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_insurer_id uuid;
  v_status text;
begin
  v_insurer_id := public.current_insurer_id();
  if v_insurer_id is null then
    raise exception 'insurer_only';
  end if;

  if public.insurer_is_active_subscription(v_insurer_id) is not true then
    raise exception 'subscription_inactive';
  end if;

  v_status := lower(coalesce(nullif(btrim(p_status), ''), 'all'));
  if v_status not in ('all', 'active', 'void') then
    raise exception 'invalid_status_filter';
  end if;

  insert into public.audit_logs(actor_type, actor_user_id, insurer_id, action, query_json, ip, user_agent)
  values (
    'insurer',
    auth.uid(),
    v_insurer_id,
    'insurer.search_vehicles',
    jsonb_build_object('q', p_query, 'limit', p_limit, 'offset', p_offset, 'status', v_status),
    p_ip,
    p_user_agent
  );

  return query
  with input as (
    select
      nullif(btrim(p_query), '') as raw_q,
      public.normalize_plate_search(nullif(btrim(p_query), '')::text) as plate_q,
      lower(nullif(btrim(p_query), '')::text) as text_q,
      v_status as status_q,
      greatest(1, least(coalesce(p_limit, 50), 100)) as lim,
      greatest(coalesce(p_offset, 0), 0) as ofs
  ),
  allowed_tenants as (
    select ita.tenant_id
    from public.insurer_tenant_access ita
    where ita.insurer_id = v_insurer_id
      and ita.is_enabled = true
  ),
  scoped_certs as (
    select
      c.id,
      c.tenant_id,
      c.vehicle_id,
      v.public_id::text as vehicle_public_id,
      c.public_id::text as certificate_public_id,
      lower(coalesce(nullif(c.status::text, ''), 'active')) as status_text,
      coalesce(c.updated_at, c.created_at) as ts,
      f.plate_display,
      f.maker,
      f.model,
      f.year_text,
      f.customer_name,
      public.norm_vehicle_plate(f.plate_display) as plate_norm,
      public.norm_vehicle_text(f.maker) as maker_norm,
      public.norm_vehicle_text(f.model) as model_norm,
      public.norm_vehicle_year(f.year_text) as year_norm,
      public.vehicle_group_key_from_fields(
        c.vehicle_id,
        f.plate_display,
        f.maker,
        f.model,
        f.year_text,
        c.id
      ) as vehicle_key
    from public.certificates c
    left join public.vehicles v
      on v.id = c.vehicle_id
     and v.tenant_id = c.tenant_id
    cross join lateral (
      select
        coalesce(
          nullif(v.plate_display::text, ''),
          nullif(c.vehicle_info_json->>'plate', ''),
          nullif(c.vehicle_info_json->>'plate_number', ''),
          nullif(c.vehicle_info_json->>'number', ''),
          ''
        ) as plate_display,
        coalesce(
          nullif(v.maker::text, ''),
          nullif(c.vehicle_info_json->>'maker', ''),
          ''
        ) as maker,
        coalesce(
          nullif(v.model::text, ''),
          nullif(c.vehicle_info_json->>'model', ''),
          ''
        ) as model,
        coalesce(
          nullif(v.year::text, ''),
          nullif(c.vehicle_info_json->>'year', ''),
          ''
        ) as year_text,
        coalesce(
          nullif(c.customer_name::text, ''),
          nullif(c.vehicle_info_json->>'customer_name', ''),
          ''
        ) as customer_name
    ) f
    where c.tenant_id in (select tenant_id from allowed_tenants)
  ),
  latest_any as (
    select distinct on (s.vehicle_key)
      s.vehicle_key,
      s.vehicle_id,
      s.vehicle_public_id,
      s.plate_display,
      s.maker,
      s.model,
      s.year_text,
      s.customer_name,
      s.certificate_public_id as latest_certificate_public_id,
      s.status_text as latest_certificate_status,
      s.ts as latest_certificate_ts
    from scoped_certs s
    order by
      s.vehicle_key,
      s.ts desc,
      s.id desc
  ),
  latest_active as (
    select distinct on (s.vehicle_key)
      s.vehicle_key,
      s.certificate_public_id as latest_active_certificate_public_id,
      s.ts
    from scoped_certs s
    where s.status_text = 'active'
    order by
      s.vehicle_key,
      s.ts desc,
      s.id desc
  ),
  cert_counts as (
    select
      s.vehicle_key,
      count(*)::bigint as certificate_count
    from scoped_certs s
    group by s.vehicle_key
  ),
  group_vehicle_ref as (
    select
      s.vehicle_key,
      (array_agg(s.vehicle_id order by s.ts desc, s.id desc)
        filter (where s.vehicle_id is not null))[1] as group_vehicle_id,
      (array_agg(s.vehicle_public_id order by s.ts desc, s.id desc)
        filter (where s.vehicle_public_id is not null and btrim(s.vehicle_public_id) <> ''))[1] as group_vehicle_public_id
    from scoped_certs s
    group by s.vehicle_key
  ),
  base as (
    select
      la.vehicle_key,
      coalesce(gvr.group_vehicle_id, la.vehicle_id) as vehicle_id,
      coalesce(gvr.group_vehicle_public_id, la.vehicle_public_id) as vehicle_public_id,
      la.plate_display,
      la.maker,
      la.model,
      la.year_text,
      la.latest_certificate_public_id,
      lact.latest_active_certificate_public_id,
      la.latest_certificate_status,
      la.latest_certificate_ts,
      coalesce(cc.certificate_count, 0) as certificate_count,
      public.norm_vehicle_plate(coalesce(la.plate_display, '')) as plate_norm,
      lower(
        coalesce(la.maker, '') || ' ' ||
        coalesce(la.model, '') || ' ' ||
        coalesce(la.year_text, '') || ' ' ||
        coalesce(la.plate_display, '') || ' ' ||
        coalesce(la.customer_name, '')
      ) as search_text
    from latest_any la
    left join latest_active lact
      on lact.vehicle_key = la.vehicle_key
    left join cert_counts cc
      on cc.vehicle_key = la.vehicle_key
    left join group_vehicle_ref gvr
      on gvr.vehicle_key = la.vehicle_key
    cross join input i
    where i.raw_q is not null
      and (
        public.norm_vehicle_plate(coalesce(la.plate_display, '')) like '%' || i.plate_q || '%'
        or lower(
          coalesce(la.maker, '') || ' ' ||
          coalesce(la.model, '') || ' ' ||
          coalesce(la.year_text, '') || ' ' ||
          coalesce(la.plate_display, '') || ' ' ||
          coalesce(la.customer_name, '')
        ) like '%' || i.text_q || '%'
      )
      and (
        i.status_q = 'all'
        or (i.status_q = 'active' and lact.latest_active_certificate_public_id is not null)
        or (
          i.status_q = 'void'
          and coalesce(la.latest_certificate_status, '') = 'void'
          and lact.latest_active_certificate_public_id is null
        )
      )
  ),
  ranked as (
    select
      b.vehicle_id,
      b.vehicle_public_id,
      b.plate_display,
      b.maker,
      b.model,
      b.year_text,
      b.latest_certificate_public_id,
      b.latest_active_certificate_public_id,
      b.latest_certificate_status,
      b.latest_certificate_ts,
      b.certificate_count,
      case
        when b.plate_norm = i.plate_q then 0
        when b.plate_norm like i.plate_q || '%' then 1
        when b.plate_norm like '%' || i.plate_q || '%' then 2
        when b.search_text like i.text_q || '%' then 3
        else 4
      end as search_rank
    from base b
    cross join input i
  )
  select
    r.vehicle_id,
    r.vehicle_public_id,
    r.plate_display,
    r.maker,
    r.model,
    r.year_text,
    r.latest_certificate_public_id,
    r.latest_active_certificate_public_id,
    r.latest_certificate_status,
    r.latest_certificate_ts,
    r.certificate_count,
    r.search_rank
  from ranked r
  order by
    r.search_rank asc,
    case
      when r.latest_active_certificate_public_id is not null then 0
      when coalesce(r.latest_certificate_status, '') = 'void' then 2
      else 1
    end asc,
    r.latest_certificate_ts desc nulls last,
    coalesce(r.vehicle_public_id, r.latest_certificate_public_id, r.vehicle_id::text) asc
  limit (select lim from input)
  offset (select ofs from input);
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_agent_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
  select exists (
    select 1 from agent_users
    where user_id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_insurer_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
  select exists (
    select 1 from insurer_users
    where user_id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin_user()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT EXISTS (
    SELECT 1 FROM tenant_memberships
    WHERE user_id = auth.uid()
      AND role = 'super_admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_supply_partner_active (
  p_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.supply_partners
    WHERE id = p_id AND status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.marketing_churn_stats()
  RETURNS json
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  result json;
  v_today date := current_date;
  v_m_start date := (date_trunc('month', v_today) - interval '1 month')::date;
  v_m_end date := date_trunc('month', v_today)::date;
  v_active_start int;
  v_churned int;
begin
  select count(*) into v_active_start
  from public.tenants
  where created_at < v_m_start
    and not (is_active = false and deactivated_at is null)
    and (deactivated_at is null or deactivated_at >= v_m_start);
  select count(*) into v_churned
  from public.tenants
  where deactivated_at >= v_m_start
    and deactivated_at < v_m_end;
  result := json_build_object(
    'monthLabel', to_char(v_m_start, 'YYYY"年"FMMM"月"'),
    'activeAtStart', v_active_start,
    'churned', v_churned,
    'ratePct', case when v_active_start > 0
      then round(v_churned::numeric / v_active_start::numeric * 100, 1) else null end,
    'measurable', v_active_start > 0
  );
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.my_agent_ids()
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
  select agent_id
  from agent_users
  where user_id = auth.uid()
    and is_active = true;
$function$;

CREATE OR REPLACE FUNCTION public.my_insurer_ids()
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
  select insurer_id
  from insurer_users
  where user_id = auth.uid()
    and is_active = true;
$function$;

CREATE OR REPLACE FUNCTION public.my_manufacturer_ids()
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  SELECT manufacturer_id
  FROM public.manufacturer_memberships
  WHERE user_id = auth.uid()
    AND is_active = true;
$function$;

CREATE OR REPLACE FUNCTION public.my_supply_partner_ids()
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  SELECT sp.id
  FROM public.supply_partners sp
  WHERE
    sp.agent_id IN (
      SELECT au.agent_id FROM public.agent_users au
      WHERE au.user_id = auth.uid() AND au.is_active = true
    )
    OR sp.owner_user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.my_tenant_ids()
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  SELECT tenant_id
  FROM public.tenant_memberships
  WHERE user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.part_assurance_rank (
  level text
)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  SELECT CASE level
    WHEN 'customer_otp'      THEN 3
    WHEN 'store_contact_otp' THEN 2
    WHEN 'in_store_tablet'   THEN 1
    WHEN 'any'               THEN 1
    ELSE 0
  END;
$function$;

CREATE OR REPLACE FUNCTION public.part_confirmation_signatures_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'part_confirmation_signatures: 署名レコードは削除できません (id=%)', OLD.id;
  END IF;
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'part_confirmation_signatures: 署名完了後は変更できません (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.part_evidence_append_only()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
  RAISE EXCEPTION
    'part_installation_evidence: 追記専用です。更新・削除はできません (id=%)',
    COALESCE(OLD.id, NEW.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.part_installations_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('customer_verified','voided') THEN
      RAISE EXCEPTION
        'part_installations: 確定済み/取消済みレコードは削除できません (id=%, status=%)',
        OLD.id, OLD.status;
    END IF;
    RETURN OLD;
  END IF;

  -- 取消済みは一切変更不可
  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION 'part_installations: 取消済みレコードは変更できません (id=%)', OLD.id;
  END IF;

  -- 確定済み: status→voided（理由必須）のみ許可。内容・署名・identity 列は据え置き必須。
  IF OLD.status = 'customer_verified' THEN
    IF NEW.status = 'voided'
       AND NEW.void_reason IS NOT NULL
       AND NEW.content_hash            IS NOT DISTINCT FROM OLD.content_hash
       AND NEW.confirmation_signature_id IS NOT DISTINCT FROM OLD.confirmation_signature_id
       AND NEW.customer_id             IS NOT DISTINCT FROM OLD.customer_id
       AND NEW.customer_verified_at    IS NOT DISTINCT FROM OLD.customer_verified_at
       AND NEW.required_assurance      IS NOT DISTINCT FROM OLD.required_assurance
       AND NEW.tenant_id               IS NOT DISTINCT FROM OLD.tenant_id
       AND NEW.part_name               IS NOT DISTINCT FROM OLD.part_name
       AND NEW.gtin                    IS NOT DISTINCT FROM OLD.gtin
       AND NEW.lot_code                IS NOT DISTINCT FROM OLD.lot_code
       AND NEW.serial_no               IS NOT DISTINCT FROM OLD.serial_no
       AND NEW.part_kind               IS NOT DISTINCT FROM OLD.part_kind
       AND NEW.quantity                IS NOT DISTINCT FROM OLD.quantity
       AND NEW.unit                    IS NOT DISTINCT FROM OLD.unit
       AND NEW.amount_jpy              IS NOT DISTINCT FROM OLD.amount_jpy
       AND NEW.job_order_id            IS NOT DISTINCT FROM OLD.job_order_id
       AND NEW.reservation_id          IS NOT DISTINCT FROM OLD.reservation_id
       AND NEW.vehicle_id              IS NOT DISTINCT FROM OLD.vehicle_id
       AND NEW.inventory_item_id       IS NOT DISTINCT FROM OLD.inventory_item_id
       AND NEW.installed_by            IS NOT DISTINCT FROM OLD.installed_by
       AND NEW.installed_at            IS NOT DISTINCT FROM OLD.installed_at
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'part_installations: 確定済みレコードは変更できません（取消のみ可・理由必須） (id=%)', OLD.id;
  END IF;

  -- installed → customer_verified への遷移ゲート（§6.4.4）
  IF NEW.status = 'customer_verified' AND OLD.status IS DISTINCT FROM 'customer_verified' THEN
    PERFORM 1
    FROM public.part_confirmation_signatures s
    JOIN public.customers c ON c.id = NEW.customer_id
    WHERE s.id = NEW.confirmation_signature_id
      AND s.installation_id = NEW.id
      AND s.status = 'signed'
      AND s.document_hash IS NOT NULL
      AND s.document_hash = NEW.content_hash
      AND s.signer_phone_full_hash IS NOT NULL
      AND c.phone_full_hash IS NOT NULL
      AND s.signer_phone_full_hash = c.phone_full_hash
      AND public.part_meets_required_assurance(s.assurance, NEW.required_assurance);

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'part_installations: 確定には本人署名・document_hash一致・電話一致・保証グレード充足が必要です (id=%)',
        NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.part_meets_required_assurance (
  actual   text,
  required text
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  SELECT public.part_assurance_rank(actual) >= public.part_assurance_rank(required);
$function$;

CREATE OR REPLACE FUNCTION public.part_register_serial (
  p_fingerprint     text,
  p_tenant_id       uuid,
  p_installation_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.part_serial_registry WHERE serial_fingerprint = p_fingerprint
  ) INTO v_exists;

  IF v_exists THEN
    RETURN 'reused';
  END IF;

  INSERT INTO public.part_serial_registry (serial_fingerprint, consumed_by_tenant_id, installation_id)
  VALUES (p_fingerprint, p_tenant_id, p_installation_id);

  RETURN 'registered';
EXCEPTION
  WHEN unique_violation THEN
    -- 競合で同時登録された場合も使い回し扱い
    RETURN 'reused';
END;
$function$;

CREATE OR REPLACE FUNCTION public.part_serial_registry_append_only()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
  RAISE EXCEPTION
    'part_serial_registry: 追記専用です。更新・削除はできません (fingerprint=%)',
    COALESCE(OLD.serial_fingerprint, NEW.serial_fingerprint);
END;
$function$;

CREATE OR REPLACE FUNCTION public.part_set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_checkout (
  p_tenant_id           uuid,
  p_reservation_id      uuid    DEFAULT NULL::uuid,
  p_customer_id         uuid    DEFAULT NULL::uuid,
  p_store_id            uuid    DEFAULT NULL::uuid,
  p_register_session_id uuid    DEFAULT NULL::uuid,
  p_payment_method      text    DEFAULT 'cash'::text,
  p_amount              integer DEFAULT 0,
  p_received_amount     integer DEFAULT NULL::integer,
  p_items_json          jsonb   DEFAULT '[]'::jsonb,
  p_tax_rate            integer DEFAULT 10,
  p_note                text    DEFAULT NULL::text,
  p_create_receipt      boolean DEFAULT true,
  p_user_id             uuid    DEFAULT NULL::uuid
)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
  v_payment_id uuid;
  v_document_id uuid;
  v_change integer;
  v_subtotal integer;
  v_tax integer;
  v_total integer;
  v_doc_number text;
  v_year_month text;
  v_next_number integer;
  v_reservation record;
BEGIN
  -- 金額計算
  v_total := p_amount;
  v_tax := ROUND(v_total * p_tax_rate::numeric / (100 + p_tax_rate));
  v_subtotal := v_total - v_tax;
  v_change := COALESCE(p_received_amount, v_total) - v_total;
  IF v_change < 0 THEN v_change := 0; END IF;

  -- 1. payment レコード作成
  INSERT INTO public.payments (
    tenant_id, store_id, reservation_id, customer_id, register_session_id,
    payment_method, amount, received_amount, change_amount, status, note,
    paid_at, created_by
  ) VALUES (
    p_tenant_id, p_store_id, p_reservation_id, p_customer_id, p_register_session_id,
    p_payment_method, v_total, p_received_amount, v_change, 'completed', p_note,
    now(), p_user_id
  )
  RETURNING id INTO v_payment_id;

  -- 2. 領収書（receipt）作成
  IF p_create_receipt THEN
    v_year_month := to_char(now(), 'YYYYMM');

    -- Atomic UPSERT increments last_number row-exclusively; no advisory
    -- lock needed because the row-level lock from UPDATE already
    -- serializes concurrent checkouts for the same (tenant, year_month).
    INSERT INTO public.pos_receipt_counters (tenant_id, year_month, last_number)
    VALUES (p_tenant_id, v_year_month, 1)
    ON CONFLICT (tenant_id, year_month)
    DO UPDATE
      SET last_number = public.pos_receipt_counters.last_number + 1,
          updated_at  = now()
    RETURNING last_number INTO v_next_number;

    v_doc_number := 'RCP-' || v_year_month || '-' || LPAD(v_next_number::text, 3, '0');

    INSERT INTO public.documents (
      tenant_id, customer_id, doc_type, doc_number, issued_at, status,
      subtotal, tax, total, tax_rate, items_json, note,
      is_invoice_compliant, show_seal, show_logo, payment_date
    ) VALUES (
      p_tenant_id, p_customer_id, 'receipt', v_doc_number, CURRENT_DATE, 'paid',
      v_subtotal, v_tax, v_total, p_tax_rate, p_items_json, p_note,
      false, false, true, CURRENT_DATE
    )
    RETURNING id INTO v_document_id;

    -- payment に document_id を紐付け
    UPDATE public.payments SET document_id = v_document_id WHERE id = v_payment_id;
  END IF;

  -- 3. 予約ステータス更新（予約がある場合）
  IF p_reservation_id IS NOT NULL THEN
    SELECT * INTO v_reservation FROM public.reservations
    WHERE id = p_reservation_id AND tenant_id = p_tenant_id;

    IF FOUND THEN
      UPDATE public.reservations
      SET payment_status = 'paid',
          payment_id = v_payment_id,
          status = CASE WHEN status = 'in_progress' THEN 'completed' ELSE status END,
          updated_at = now()
      WHERE id = p_reservation_id;
    END IF;
  END IF;

  -- 4. register_session の集計更新（セッションがある場合）
  IF p_register_session_id IS NOT NULL THEN
    UPDATE public.register_sessions
    SET total_sales = COALESCE(total_sales, 0) + v_total,
        total_transactions = COALESCE(total_transactions, 0) + 1,
        updated_at = now()
    WHERE id = p_register_session_id AND tenant_id = p_tenant_id;
  END IF;

  -- 結果を返す
  RETURN json_build_object(
    'payment_id', v_payment_id,
    'document_id', v_document_id,
    'amount', v_total,
    'change', v_change,
    'doc_number', v_doc_number,
    'status', 'completed'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pricing_elasticity_stats (
  p_tenant_id uuid,
  p_since     timestamp with time zone DEFAULT NULL::timestamp WITH time zone
)
  RETURNS TABLE (
    period_month            date,
    title                   text,
    reservation_count       bigint,
    completed_count         bigint,
    cancelled_count         bigint,
    avg_estimated_amount    numeric,
    min_estimated_amount    integer,
    max_estimated_amount    integer,
    total_completed_revenue bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
  WITH bounded AS (
    SELECT
      DATE_TRUNC('month', r.created_at)::date AS period_month,
      COALESCE(NULLIF(TRIM(r.title), ''), '(未設定)') AS title,
      r.status,
      r.estimated_amount
    FROM public.reservations r
    WHERE r.tenant_id = p_tenant_id
      AND r.created_at >= COALESCE(p_since, now() - interval '12 months')
  )
  SELECT
    period_month,
    title,
    COUNT(*)::bigint AS reservation_count,
    COUNT(*) FILTER (WHERE status = 'completed')::bigint AS completed_count,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint AS cancelled_count,
    AVG(estimated_amount) FILTER (WHERE estimated_amount IS NOT NULL)::numeric AS avg_estimated_amount,
    MIN(estimated_amount) FILTER (WHERE estimated_amount IS NOT NULL) AS min_estimated_amount,
    MAX(estimated_amount) FILTER (WHERE estimated_amount IS NOT NULL) AS max_estimated_amount,
    COALESCE(
      SUM(estimated_amount) FILTER (WHERE status = 'completed' AND estimated_amount IS NOT NULL),
      0
    )::bigint AS total_completed_revenue
  FROM bounded
  GROUP BY period_month, title
  ORDER BY period_month DESC, reservation_count DESC, title ASC
$function$;

CREATE OR REPLACE FUNCTION public.publish_mutual_reviews()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.order_reviews
  WHERE job_order_id = NEW.job_order_id AND published_at IS NULL;
  IF v_count >= 2 THEN
    UPDATE public.order_reviews
    SET published_at = now()
    WHERE job_order_id = NEW.job_order_id AND published_at IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_order_items_guard_response_qty()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.accepted_quantity  := OLD.accepted_quantity;
      NEW.backorder_quantity := OLD.backorder_quantity;
    ELSE
      NEW.accepted_quantity  := NULL;
      NEW.backorder_quantity := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_orders_guard_partner_response()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.partner_response      := OLD.partner_response;
      NEW.partner_responded_at  := OLD.partner_responded_at;
      NEW.partner_ship_eta      := OLD.partner_ship_eta;
      NEW.partner_tracking_no   := OLD.partner_tracking_no;
      NEW.partner_response_note := OLD.partner_response_note;
      NEW.decline_reason        := OLD.decline_reason;
    ELSE
      NEW.partner_response      := NULL;
      NEW.partner_responded_at  := NULL;
      NEW.partner_ship_eta      := NULL;
      NEW.partner_tracking_no   := NULL;
      NEW.partner_response_note := NULL;
      NEW.decline_reason        := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_academy_lesson_rating()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
DECLARE
  target_id uuid := COALESCE(NEW.lesson_id, OLD.lesson_id);
  v_avg numeric(3,2);
  v_count int;
BEGIN
  SELECT COALESCE(AVG(rating), 0)::numeric(3,2), COUNT(*)
    INTO v_avg, v_count
    FROM academy_lesson_ratings
    WHERE lesson_id = target_id;

  UPDATE academy_lessons
    SET rating_avg = v_avg,
        rating_count = v_count,
        updated_at = now()
    WHERE id = target_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_academy_progress_on_completion()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
DECLARE
  target_user   uuid := COALESCE(NEW.user_id, OLD.user_id);
  target_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_total_score int;
  v_lessons_completed int;
BEGIN
  IF target_tenant IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(score_earned), 0), COUNT(*)
    INTO v_total_score, v_lessons_completed
    FROM academy_lesson_completions
    WHERE user_id = target_user;

  INSERT INTO academy_progress (
    tenant_id, user_id, total_score, lessons_completed, last_activity_at, updated_at
  )
  VALUES (target_tenant, target_user, v_total_score, v_lessons_completed, now(), now())
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET
    total_score       = EXCLUDED.total_score,
    lessons_completed = EXCLUDED.lessons_completed,
    last_activity_at  = EXCLUDED.last_activity_at,
    updated_at        = EXCLUDED.updated_at;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_partner_score (
  p_tenant_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
  v_total integer; v_completed integer; v_on_time integer; v_cancelled integer;
  v_avg numeric(3,2); v_count integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status = 'completed'),
    count(*) FILTER (WHERE status = 'completed' AND (deadline IS NULL OR vendor_completed_at <= deadline + interval '1 day')),
    count(*) FILTER (WHERE status = 'cancelled')
  INTO v_total, v_completed, v_on_time, v_cancelled
  FROM public.job_orders WHERE from_tenant_id = p_tenant_id OR to_tenant_id = p_tenant_id;

  SELECT avg(rating)::numeric(3,2), count(*) INTO v_avg, v_count
  FROM public.order_reviews WHERE reviewed_tenant_id = p_tenant_id AND published_at IS NOT NULL;

  INSERT INTO public.partner_scores (tenant_id, total_orders, completed_orders, on_time_orders, cancelled_orders, avg_rating, rating_count, updated_at)
  VALUES (p_tenant_id, v_total, v_completed, v_on_time, v_cancelled, v_avg, v_count, now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_orders = EXCLUDED.total_orders, completed_orders = EXCLUDED.completed_orders,
    on_time_orders = EXCLUDED.on_time_orders, cancelled_orders = EXCLUDED.cancelled_orders,
    avg_rating = EXCLUDED.avg_rating, rating_count = EXCLUDED.rating_count, updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.replace_staff_shifts (
  p_staff_id uuid,
  p_shifts   jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_tenant uuid;
  v_today  date := current_date;
begin
  select tenant_id into v_tenant from public.staff_members where id = p_staff_id;
  if v_tenant is null then
    raise exception 'staff not found';
  end if;
  if not exists (
    select 1 from public.tenant_memberships
    where tenant_id = v_tenant and user_id = auth.uid() and lower(role::text) in ('super_admin', 'owner', 'admin')
  ) then
    raise exception 'forbidden';
  end if;

  delete from public.staff_shifts
  where staff_id = p_staff_id and tenant_id = v_tenant and work_date >= v_today;

  insert into public.staff_shifts (id, tenant_id, staff_id, work_date, start_time, end_time, note)
  select gen_random_uuid(), v_tenant, p_staff_id,
         (s->>'work_date')::date,
         nullif(s->>'start_time', '')::time,
         nullif(s->>'end_time', '')::time,
         nullif(s->>'note', '')
  from jsonb_array_elements(coalesce(p_shifts, '[]'::jsonb)) as s
  where (s->>'work_date')::date >= v_today;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_site_content_posts_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_performance_stats (
  p_tenant_id uuid,
  p_since     timestamp with time zone DEFAULT NULL::timestamp WITH time zone
)
  RETURNS TABLE (
    user_id                uuid,
    cert_count             bigint,
    cert_anchored_count    bigint,
    avg_authenticity_grade numeric,
    review_count           bigint,
    avg_review_rating      numeric,
    reservations_completed bigint,
    reservations_cancelled bigint,
    avg_work_minutes       numeric,
    distinct_customers     bigint,
    returning_customers    bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
  WITH
  -- Certificates issued by each staff member in window.
  cert_base AS (
    SELECT
      c.id,
      c.created_by AS user_id,
      c.customer_id
    FROM public.certificates c
    WHERE c.tenant_id = p_tenant_id
      AND c.created_by IS NOT NULL
      AND (p_since IS NULL OR c.created_at >= p_since)
  ),
  cert_stats AS (
    SELECT
      user_id,
      COUNT(*)::bigint AS cert_count,
      COUNT(DISTINCT customer_id)::bigint AS distinct_customers,
      COUNT(DISTINCT customer_id) FILTER (
        WHERE customer_id IN (
          SELECT customer_id FROM cert_base cb2
          WHERE cb2.user_id = cert_base.user_id
          GROUP BY customer_id
          HAVING COUNT(*) > 1
        )
      )::bigint AS returning_customers
    FROM cert_base
    GROUP BY user_id
  ),
  -- Anchored cert count + avg authenticity grade
  -- (numeric encoding: unverified=0, basic=1, verified=2, premium=3).
  anchored_stats AS (
    SELECT
      cb.user_id,
      COUNT(DISTINCT cb.id) FILTER (WHERE ci.polygon_tx_hash IS NOT NULL)::bigint AS cert_anchored_count,
      AVG(
        CASE ci.authenticity_grade
          WHEN 'unverified' THEN 0
          WHEN 'basic'      THEN 1
          WHEN 'verified'   THEN 2
          WHEN 'premium'    THEN 3
        END
      ) AS avg_authenticity_grade
    FROM cert_base cb
    LEFT JOIN public.certificate_images ci ON ci.certificate_id = cb.id
    GROUP BY cb.user_id
  ),
  -- Customer reviews (1-5 star) on this staff's certificates.
  review_stats AS (
    SELECT
      cb.user_id,
      COUNT(sr.id)::bigint AS review_count,
      AVG(sr.rating)::numeric AS avg_review_rating
    FROM cert_base cb
    JOIN public.signature_reviews sr ON sr.certificate_id = cb.id
    WHERE sr.tenant_id = p_tenant_id
    GROUP BY cb.user_id
  ),
  -- Reservations assigned to each staff member.
  res_stats AS (
    SELECT
      r.assigned_user_id AS user_id,
      COUNT(*) FILTER (WHERE r.status = 'completed')::bigint AS reservations_completed,
      COUNT(*) FILTER (WHERE r.status = 'cancelled')::bigint AS reservations_cancelled,
      AVG(
        EXTRACT(EPOCH FROM (r.work_completed_at - r.work_started_at)) / 60.0
      ) FILTER (
        WHERE r.work_completed_at IS NOT NULL
          AND r.work_started_at IS NOT NULL
          AND r.work_completed_at > r.work_started_at
      )::numeric AS avg_work_minutes
    FROM public.reservations r
    WHERE r.tenant_id = p_tenant_id
      AND r.assigned_user_id IS NOT NULL
      AND (p_since IS NULL OR r.created_at >= p_since)
    GROUP BY r.assigned_user_id
  )
  SELECT
    u.user_id,
    COALESCE(cs.cert_count, 0)             AS cert_count,
    COALESCE(a.cert_anchored_count, 0)     AS cert_anchored_count,
    a.avg_authenticity_grade,
    COALESCE(rv.review_count, 0)           AS review_count,
    rv.avg_review_rating,
    COALESCE(rs.reservations_completed, 0) AS reservations_completed,
    COALESCE(rs.reservations_cancelled, 0) AS reservations_cancelled,
    rs.avg_work_minutes,
    COALESCE(cs.distinct_customers, 0)     AS distinct_customers,
    COALESCE(cs.returning_customers, 0)    AS returning_customers
  FROM (
    -- Union the user_ids active in *any* stat so we don't lose
    -- staff that only have reservations or only have reviews.
    SELECT user_id FROM cert_stats
    UNION
    SELECT user_id FROM res_stats
    UNION
    SELECT user_id FROM review_stats WHERE user_id IS NOT NULL
  ) u
  LEFT JOIN cert_stats     cs ON cs.user_id = u.user_id
  LEFT JOIN anchored_stats a  ON a.user_id  = u.user_id
  LEFT JOIN review_stats   rv ON rv.user_id = u.user_id
  LEFT JOIN res_stats      rs ON rs.user_id = u.user_id
$function$;

CREATE OR REPLACE FUNCTION public.staff_roster_stats (
  p_tenant_id uuid,
  p_since     timestamp with time zone DEFAULT NULL::timestamp WITH time zone
)
  RETURNS TABLE (
    staff_id          uuid,
    assignments_total bigint,
    completed         bigint,
    cancelled         bigint,
    avg_work_minutes  numeric
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  if not public.tenant_caller_has_role(p_tenant_id, array['super_admin', 'owner', 'admin']) then
    return;
  end if;
  return query
    select
      r.assigned_staff_id as staff_id,
      count(*)::bigint as assignments_total,
      count(*) filter (where r.status = 'completed')::bigint as completed,
      count(*) filter (where r.status = 'cancelled')::bigint as cancelled,
      avg(
        extract(epoch from (r.work_completed_at - r.work_started_at)) / 60.0
      ) filter (
        where r.work_completed_at is not null
          and r.work_started_at is not null
          and r.work_completed_at > r.work_started_at
      )::numeric as avg_work_minutes
    from public.reservations r
    where r.tenant_id = p_tenant_id
      and r.assigned_staff_id is not null
      and (p_since is null or r.created_at >= p_since)
    group by r.assigned_staff_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_marketing_leads_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $function$;

CREATE OR REPLACE FUNCTION public.touch_vehicle_passports_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $function$;

CREATE OR REPLACE FUNCTION public.update_delivery_receipts_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.update_signature_sessions_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_agent_user (
  p_agent_id     uuid,
  p_email        text,
  p_role         text DEFAULT 'viewer'::text,
  p_display_name text DEFAULT NULL::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
declare
  v_user_id uuid;
  v_au_id uuid;
begin
  select au.id into v_user_id
  from auth.users au
  where lower(au.email) = lower(p_email)
  limit 1;

  if v_user_id is null then
    raise exception 'Auth user not found for email: %', p_email;
  end if;

  insert into agent_users (agent_id, user_id, role, display_name, is_active)
  values (p_agent_id, v_user_id, p_role, p_display_name, true)
  on conflict (agent_id, user_id)
  do update set
    role = excluded.role,
    display_name = coalesce(excluded.display_name, agent_users.display_name),
    is_active = true,
    updated_at = now()
  returning id into v_au_id;

  return v_au_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_insurer_user (
  p_insurer_id   uuid,
  p_email        text,
  p_role         text DEFAULT 'viewer'::text,
  p_display_name text DEFAULT NULL::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
declare
  v_user_id uuid;
  v_iu_id uuid;
begin
  -- Lookup auth user by email
  select au.id into v_user_id
  from auth.users au
  where lower(au.email) = lower(p_email)
  limit 1;

  if v_user_id is null then
    raise exception 'Auth user not found for email: %', p_email;
  end if;

  -- Upsert insurer_users
  insert into insurer_users (insurer_id, user_id, role, display_name, is_active)
  values (p_insurer_id, v_user_id, p_role, p_display_name, true)
  on conflict (insurer_id, user_id)
  do update set
    role = excluded.role,
    display_name = coalesce(excluded.display_name, insurer_users.display_name),
    is_active = true,
    updated_at = now()
  returning id into v_iu_id;

  return v_iu_id;
end;
$function$;

ALTER TABLE "public"."agent_signing_requests"
  ADD CONSTRAINT "agent_signing_requests_ledra_session_id_fkey" FOREIGN KEY (ledra_session_id) REFERENCES public.signature_sessions(id) ON DELETE SET NULL;

ALTER TABLE "public"."certificate_images"
  ADD CONSTRAINT "certificate_images_file_size_check" CHECK ((file_size > 0));

ALTER TABLE "public"."certificate_images"
  ADD CONSTRAINT "certificate_images_storage_path_key" UNIQUE (storage_path);

ALTER TABLE "public"."certificate_images"
  ADD CONSTRAINT "certificate_images_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."customers"
  ADD CONSTRAINT "customers_line_link_status_check" CHECK ((line_link_status = ANY (ARRAY['unlinked'::text, 'pending'::text, 'linked'::text])));

ALTER TABLE "public"."documents"
  ADD CONSTRAINT "documents_assigned_user_id_fkey" FOREIGN KEY (assigned_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."documents"
  ADD CONSTRAINT "documents_job_status_check" CHECK ((job_status = ANY (ARRAY['draft'::text, 'booked'::text, 'in_progress'::text, 'qc'::text, 'ready'::text, 'delivered'::text])));

ALTER TABLE "public"."insurer_access_logs"
  ADD CONSTRAINT "insurer_access_logs_action_check" CHECK ((action = ANY (ARRAY['view'::text, 'search'::text, 'download_pdf'::text, 'export_csv'::text])));

ALTER TABLE "public"."insurer_access_logs"
  ADD CONSTRAINT "insurer_access_logs_insurer_user_fk" FOREIGN KEY (insurer_user_id) REFERENCES public.insurer_users(id) NOT VALID;

ALTER TABLE "public"."insurer_cases"
  ADD CONSTRAINT "insurer_cases_case_number_key" UNIQUE (case_number);

ALTER TABLE "public"."insurer_users"
  ADD CONSTRAINT "insurer_users_user_id_key" UNIQUE (user_id);

ALTER TABLE "public"."job_orders"
  ADD CONSTRAINT "job_orders_budget_max_check" CHECK ((budget_max >= 0));

ALTER TABLE "public"."job_orders"
  ADD CONSTRAINT "job_orders_budget_min_check" CHECK ((budget_min >= 0));

ALTER TABLE "public"."job_orders"
  ADD CONSTRAINT "job_orders_public_id_key" UNIQUE (public_id);

ALTER TABLE "public"."job_orders"
  ADD CONSTRAINT "job_orders_service_category_check"
    CHECK ((service_category = ANY (ARRAY['window_film'::text, 'body_glass_coat'::text, 'ppf'::text, 'wrap'::text, 'other'::text])));

ALTER TABLE "public"."nfc_tags"
  ADD CONSTRAINT "nfc_tags_tenant_tag_code_key" UNIQUE (tenant_id, tag_code);

ALTER TABLE "public"."part_installations"
  ADD CONSTRAINT "part_installations_status_check" CHECK ((status = ANY (ARRAY['installed'::text, 'customer_verified'::text, 'disputed'::text, 'voided'::text])));

ALTER TABLE "public"."templates"
  ADD CONSTRAINT "templates_shared_is_platform_owned" CHECK (((scope <> 'shared'::public.template_scope_enum) OR (tenant_id IS NULL)));

ALTER TABLE "public"."tenants"
  ADD CONSTRAINT "tenants_custom_domain_format"
    CHECK
    (((custom_domain IS NULL) OR ((custom_domain !~* '^\s*$'::text) AND (custom_domain !~* 'https?://'::text) AND (custom_domain !~ '/'::text) AND (custom_domain ~*
    '^[a-z0-9.-]+\.[a-z]{2,}$'::text))));

ALTER TABLE "public"."vehicles"
  ADD CONSTRAINT "vehicles_public_id_format_chk" CHECK ((public_id ~ '^v_[0-9a-f]{24}$'::text));

CREATE VIEW "public"."certificates_public" WITH (security_invoker=on) AS  SELECT c.public_id,
    c.status,
    NULL::text AS customer_name,
    c.vehicle_info_json,
    NULL::text AS content_free_text,
    c.content_preset_json,
    c.expiry_type,
    c.expiry_value,
    c.logo_asset_path,
    c.footer_variant,
    c.current_version,
    c.created_at,
    tpc.tenant_name,
    tpc.tenant_slug,
    tpc.tenant_custom_domain,
    c.craftsman_name
   FROM (public.certificates c
     LEFT JOIN LATERAL public.certificate_public_tenant(c.tenant_id) tpc(tenant_name, tenant_slug, tenant_custom_domain) ON (true));

CREATE VIEW "public"."invoices" WITH (security_invoker=on) AS  SELECT id,
    tenant_id,
    customer_id,
    doc_number AS invoice_number,
    issued_at,
    due_date,
    status,
    subtotal,
    tax,
    total,
    tax_rate,
    note,
    items_json,
    is_invoice_compliant,
    show_seal,
    show_logo,
    show_bank_info,
    recipient_name,
    payment_date,
    vehicle_id,
    vehicle_info_json,
    created_at,
    updated_at,
    job_status,
    assigned_user_id
   FROM public.documents
  WHERE (doc_type = 'invoice'::text);

CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action, created_at DESC);

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX audit_logs_insurer_idx ON public.audit_logs USING btree (insurer_id, created_at DESC);

CREATE INDEX certificate_images_certificate_id_sort_idx ON public.certificate_images USING btree (certificate_id, sort_order, created_at);

CREATE INDEX certificate_images_tenant_id_created_idx ON public.certificate_images USING btree (tenant_id, created_at DESC);

CREATE INDEX customer_login_codes_lookup ON public.customer_login_codes USING btree (tenant_id, lower(email), phone_last4_hash, expires_at);

CREATE INDEX customer_sessions_lookup ON public.customer_sessions USING btree (tenant_id, lower(email), phone_last4_hash, expires_at);

CREATE UNIQUE INDEX customer_sessions_session_hash_uniq ON public.customer_sessions USING btree (session_hash);

CREATE INDEX idx_asr_engine ON public.agent_signing_requests USING btree (sign_engine, status);

CREATE INDEX idx_asr_ledra_session ON public.agent_signing_requests USING btree (ledra_session_id)
  WHERE (ledra_session_id IS NOT NULL);

CREATE INDEX idx_audit_logs_tenant_performed ON public.audit_logs USING btree (tenant_id, performed_at DESC);

CREATE INDEX idx_certificates_tenant_vehicle ON public.certificates USING btree (tenant_id, vehicle_id);

CREATE INDEX idx_certificates_vehicle_active_latest ON public.certificates USING btree (vehicle_id, updated_at DESC, created_at DESC, id DESC)
  WHERE (status = 'active'::public.certificate_status_enum);

CREATE INDEX idx_certificates_vehicle_id ON public.certificates USING btree (vehicle_id);

CREATE INDEX idx_customers_tenant_line_status ON public.customers USING btree (tenant_id, line_link_status, created_at DESC);

CREATE INDEX idx_customers_tenant_line_user ON public.customers USING btree (tenant_id, line_user_id)
  WHERE (line_user_id IS NOT NULL);

CREATE INDEX idx_documents_assigned_user ON public.documents USING btree (tenant_id, assigned_user_id);

CREATE INDEX idx_documents_job_status ON public.documents USING btree (tenant_id, job_status);

CREATE INDEX idx_job_orders_category ON public.job_orders USING btree (service_category);

CREATE INDEX idx_job_orders_prefecture ON public.job_orders USING btree (prefecture);

CREATE INDEX idx_job_orders_status ON public.job_orders USING btree (status);

CREATE INDEX idx_nfc_tags_certificate_id ON public.nfc_tags USING btree (certificate_id);

CREATE INDEX idx_nfc_tags_tenant_id ON public.nfc_tags USING btree (tenant_id);

CREATE INDEX idx_nfc_tags_vehicle_id ON public.nfc_tags USING btree (vehicle_id);

CREATE INDEX idx_vehicle_histories_tenant_id ON public.vehicle_histories USING btree (tenant_id);

CREATE INDEX idx_vehicle_histories_vehicle_id ON public.vehicle_histories USING btree (vehicle_id);

CREATE INDEX idx_vehicle_histories_vehicle_performed_at ON public.vehicle_histories USING btree (vehicle_id, performed_at DESC);

CREATE INDEX idx_vehicles_plate_hash ON public.vehicles USING btree (plate_hash);

CREATE INDEX idx_vehicles_tenant_created_at ON public.vehicles USING btree (tenant_id, created_at DESC);

CREATE INDEX idx_vehicles_tenant_id ON public.vehicles USING btree (tenant_id);

CREATE INDEX idx_vehicles_tenant_shaken ON public.vehicles USING btree (tenant_id, inspection_expiry_date)
  WHERE (inspection_expiry_date IS NOT NULL);

CREATE INDEX insurer_access_logs_certificate_created_idx ON public.insurer_access_logs USING btree (certificate_id, created_at DESC);

CREATE INDEX insurer_access_logs_insurer_created_idx ON public.insurer_access_logs USING btree (insurer_id, created_at DESC);

CREATE INDEX insurer_tenant_access_insurer_idx ON public.insurer_tenant_access USING btree (insurer_id);

CREATE INDEX insurers_is_active_idx ON public.insurers USING btree (is_active);

CREATE UNIQUE INDEX tenants_custom_domain_uniq ON public.tenants USING btree (lower(custom_domain))
  WHERE (custom_domain IS NOT NULL);

CREATE INDEX tenants_stripe_customer_id_idx ON public.tenants USING btree (stripe_customer_id);

CREATE INDEX tenants_stripe_subscription_id_idx ON public.tenants USING btree (stripe_subscription_id);

CREATE INDEX vehicles_plate_display_trgm ON public.vehicles USING gin (plate_display extensions.gin_trgm_ops);

CREATE UNIQUE INDEX vehicles_public_id_uidx ON public.vehicles USING btree (public_id);

CREATE RULE invoices_delete AS
    ON DELETE TO public.invoices DO INSTEAD  DELETE FROM public.documents
  WHERE (documents.id = old.id);

CREATE RULE invoices_insert AS
    ON INSERT TO public.invoices DO INSTEAD  INSERT INTO public.documents (id, tenant_id, customer_id, doc_type, doc_number, issued_at, due_date, status, job_status, assigned_user_id, subtotal, tax, total, tax_rate, items_json, note, meta_json, is_invoice_compliant, show_seal, show_logo, show_bank_info, recipient_name, payment_date, vehicle_id, vehicle_info_json, created_at, updated_at)
  VALUES (COALESCE(new.id, gen_random_uuid()), new.tenant_id, new.customer_id, 'invoice'::text, new.invoice_number, new.issued_at, new.due_date, new.status, COALESCE(new.job_status, 'draft'::text), new.assigned_user_id, new.subtotal, new.tax, new.total, COALESCE(new.tax_rate, 10), new.items_json, new.note, '{}'::jsonb, COALESCE(new.is_invoice_compliant, false), COALESCE(new.show_seal, false), COALESCE(new.show_logo, true), COALESCE(new.show_bank_info, false), new.recipient_name, new.payment_date, new.vehicle_id, COALESCE(new.vehicle_info_json, '{}'::jsonb), COALESCE(new.created_at, now()), COALESCE(new.updated_at, now()));

CREATE RULE invoices_update AS
    ON UPDATE TO public.invoices DO INSTEAD  UPDATE public.documents SET tenant_id = new.tenant_id, customer_id = new.customer_id, doc_number = new.invoice_number, issued_at = new.issued_at, due_date = new.due_date, status = new.status, job_status = new.job_status, assigned_user_id = new.assigned_user_id, subtotal = new.subtotal, tax = new.tax, total = new.total, tax_rate = new.tax_rate, items_json = new.items_json, note = new.note, is_invoice_compliant = new.is_invoice_compliant, show_seal = new.show_seal, show_logo = new.show_logo, show_bank_info = new.show_bank_info, recipient_name = new.recipient_name, payment_date = new.payment_date, vehicle_id = new.vehicle_id, vehicle_info_json = new.vehicle_info_json, updated_at = new.updated_at
  WHERE (documents.id = old.id);

CREATE TRIGGER trg_set_case_number
  BEFORE INSERT ON public.insurer_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_case_number();

CREATE TRIGGER trg_job_orders_updated_at
  BEFORE UPDATE ON public.job_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE POLICY "rewards_select_tenant_admin" ON "public"."academy_creator_rewards"
  FOR SELECT
  TO PUBLIC
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM public.tenant_memberships tm
  WHERE ((tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::public.membership_role_enum, 'super_admin'::public.membership_role_enum]))))));

CREATE POLICY "academy_lessons_delete_author" ON "public"."academy_lessons"
  FOR DELETE
  TO "authenticated"
  USING (((author_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.tenant_memberships
  WHERE ((tenant_memberships.user_id = auth.uid()) AND (tenant_memberships.role = 'super_admin'::public.membership_role_enum))))));

CREATE POLICY "academy_lessons_insert" ON "public"."academy_lessons"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((tenant_id IN ( SELECT tenant_memberships.tenant_id
   FROM public.tenant_memberships
  WHERE (tenant_memberships.user_id = auth.uid()))) OR ((tenant_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.tenant_memberships
  WHERE ((tenant_memberships.user_id = auth.uid()) AND (tenant_memberships.role = 'super_admin'::public.membership_role_enum)))))));

CREATE POLICY "academy_lessons_select_own_tenant" ON "public"."academy_lessons"
  FOR SELECT
  TO "authenticated"
  USING (((tenant_id IN ( SELECT tenant_memberships.tenant_id
   FROM public.tenant_memberships
  WHERE (tenant_memberships.user_id = auth.uid()))) OR (author_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.tenant_memberships
  WHERE ((tenant_memberships.user_id = auth.uid()) AND (tenant_memberships.role = 'super_admin'::public.membership_role_enum))))));

CREATE POLICY "academy_lessons_update_author" ON "public"."academy_lessons"
  FOR UPDATE
  TO "authenticated"
  USING (((author_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.tenant_memberships
  WHERE ((tenant_memberships.user_id = auth.uid()) AND (tenant_memberships.role = 'super_admin'::public.membership_role_enum))))))
  WITH CHECK (((author_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.tenant_memberships
  WHERE ((tenant_memberships.user_id = auth.uid()) AND (tenant_memberships.role = 'super_admin'::public.membership_role_enum))))));

CREATE POLICY "academy_quiz_questions_select_author" ON "public"."academy_quiz_questions"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.academy_lessons l
  WHERE ((l.id = academy_quiz_questions.lesson_id) AND ((l.author_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.tenant_memberships
          WHERE ((tenant_memberships.user_id = auth.uid()) AND (tenant_memberships.role = 'super_admin'::public.membership_role_enum)))))))));

CREATE POLICY "academy_quiz_questions_write_author" ON "public"."academy_quiz_questions"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.academy_lessons l
  WHERE ((l.id = academy_quiz_questions.lesson_id) AND ((l.author_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.tenant_memberships
          WHERE ((tenant_memberships.user_id = auth.uid()) AND (tenant_memberships.role = 'super_admin'::public.membership_role_enum)))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.academy_lessons l
  WHERE ((l.id = academy_quiz_questions.lesson_id) AND ((l.author_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.tenant_memberships
          WHERE ((tenant_memberships.user_id = auth.uid()) AND (tenant_memberships.role = 'super_admin'::public.membership_role_enum)))))))));

CREATE POLICY "aal_select_platform_admin" ON "public"."admin_audit_logs"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.tenant_memberships tm
  WHERE
    ((tm.user_id = auth.uid()) AND (tm.tenant_id = public.get_platform_tenant_id()) AND (tm.role = ANY (ARRAY['admin'::public.membership_role_enum,
    'owner'::public.membership_role_enum]))))));

CREATE POLICY "public read active certificates by public_id" ON "public"."certificates"
  FOR SELECT
  TO "anon"
  USING (((status = 'active'::public.certificate_status_enum) AND (public_id IS NOT NULL)));

CREATE POLICY "cert_public_read_active" ON "public"."certificates"
  FOR SELECT
  TO "anon"
  USING ((status = 'active'::public.certificate_status_enum));

CREATE POLICY "cert_select_member" ON "public"."certificates"
  FOR SELECT
  TO PUBLIC
  USING (public.is_member_of_tenant(tenant_id));

CREATE POLICY "tenant_members_select" ON "public"."customer_inquiries"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.tenant_memberships tm
  WHERE ((tm.tenant_id = customer_inquiries.tenant_id) AND (tm.user_id = auth.uid())))));

CREATE POLICY "tenant_members_update" ON "public"."customer_inquiries"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.tenant_memberships tm
  WHERE ((tm.tenant_id = customer_inquiries.tenant_id) AND (tm.user_id = auth.uid())))));

CREATE POLICY "logs_insert_self_only" ON "public"."insurer_access_logs"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((insurer_id IN ( SELECT iu.insurer_id
   FROM public.insurer_users iu
  WHERE ((iu.user_id = auth.uid()) AND (iu.is_active = true)))) AND (insurer_user_id IN ( SELECT iu.id
   FROM public.insurer_users iu
  WHERE ((iu.user_id = auth.uid()) AND (iu.is_active = true))))));

CREATE POLICY "logs_select_same_insurer" ON "public"."insurer_access_logs"
  FOR SELECT
  TO "authenticated"
  USING ((insurer_id IN ( SELECT iu.insurer_id
   FROM public.insurer_users iu
  WHERE ((iu.user_id = auth.uid()) AND (iu.is_active = true)))));

CREATE POLICY "insurer_users_select_self" ON "public"."insurer_users"
  FOR SELECT
  TO "authenticated"
  USING (((user_id = auth.uid()) AND (COALESCE(is_active, true) = true)));

CREATE POLICY "insurers_select_linked_user" ON "public"."insurers"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.insurer_users iu
  WHERE ((iu.insurer_id = insurers.id) AND (iu.user_id = auth.uid()) AND (COALESCE(iu.is_active, true) = true)))));

CREATE POLICY "insurers_select_own" ON "public"."insurers"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.insurer_users iu
  WHERE ((iu.insurer_id = insurers.id) AND (iu.user_id = auth.uid()) AND (iu.is_active = true)))));

CREATE POLICY "owner can add organization members" ON "public"."organization_members"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((organization_id IN ( SELECT organizations.id
   FROM public.organizations
  WHERE (organizations.owner_id = auth.uid()))) AND (tenant_id IN ( SELECT tenant_memberships.tenant_id
   FROM public.tenant_memberships
  WHERE ((tenant_memberships.user_id = auth.uid()) AND (tenant_memberships.role = 'owner'::public.membership_role_enum))))));

CREATE POLICY "reservations_insert_v2" ON "public"."reservations"
  FOR INSERT
  TO PUBLIC
  WITH
    CHECK
    (((tenant_id IN ( SELECT public.my_tenant_ids() AS my_tenant_ids)) AND (public.my_tenant_role(tenant_id) = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text,
    'super_admin'::text]))));

CREATE POLICY "reservations_update_v2" ON "public"."reservations"
  FOR UPDATE
  TO PUBLIC
  USING
    (((tenant_id IN ( SELECT public.my_tenant_ids() AS my_tenant_ids)) AND (public.my_tenant_role(tenant_id) = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text,
    'super_admin'::text]))));

CREATE POLICY "templates_select" ON "public"."templates"
  FOR SELECT
  TO PUBLIC
  USING (((scope = 'shared'::public.template_scope_enum) OR ((scope = 'tenant'::public.template_scope_enum) AND public.is_member_of_tenant(tenant_id))));

CREATE POLICY "tenant_memberships_insert_v2" ON "public"."tenant_memberships"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((tenant_id IN ( SELECT public.my_tenant_ids() AS my_tenant_ids)) AND (public.my_tenant_role(tenant_id) = 'owner'::text) AND ((role)::text <> 'super_admin'::text)));

CREATE POLICY "tenant_memberships_update_v2" ON "public"."tenant_memberships"
  FOR UPDATE
  TO PUBLIC
  USING (((tenant_id IN ( SELECT public.my_tenant_ids() AS my_tenant_ids)) AND (public.my_tenant_role(tenant_id) = 'owner'::text) AND ((ROLE)::text <> 'super_admin'::text)))
  WITH CHECK (((tenant_id IN ( SELECT public.my_tenant_ids() AS my_tenant_ids)) AND (public.my_tenant_role(tenant_id) = 'owner'::text) AND ((role)::text <> 'super_admin'::text)));

CREATE POLICY "tm_select_self" ON "public"."tenant_memberships"
  FOR SELECT
  TO PUBLIC
  USING ((user_id = auth.uid()));

CREATE POLICY "tenants_select_member" ON "public"."tenants"
  FOR SELECT
  TO PUBLIC
  USING (public.is_member_of_tenant(id));

CREATE POLICY "assets_tenant_rw" ON "storage"."objects"
  FOR ALL
  TO "authenticated"
  USING (((bucket_id = 'assets'::text) AND (name ~~ (('tenants/'::text || (public.current_tenant_id())::text) || '/%'::text))))
  WITH CHECK (((bucket_id = 'assets'::text) AND (name ~~ (('tenants/'::text || (public.current_tenant_id())::text) || '/%'::text))));

CREATE POLICY "assets_write_tenant" ON "storage"."objects"
  FOR ALL
  TO "authenticated"
  USING (((bucket_id = 'assets'::text) AND (name ~~ 'tenants/%'::text)))
  WITH CHECK (((bucket_id = 'assets'::text) AND (name ~~ 'tenants/%'::text)));

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

COMMENT ON COLUMN "public"."agent_signing_requests"."ledra_session_id" IS 'Ledra 自前署名の場合に参照する signature_sessions.id';

COMMENT ON COLUMN "public"."agent_signing_requests"."sign_engine" IS 'cloudsign: CloudSign API 経由, ledra: Ledra 自前 ECDSA 署名';

COMMENT ON COLUMN "public"."agent_signing_requests"."sign_url" IS 'Ledra 署名エンジン使用時のワンタイム URL（/agent-sign/[token]）';

COMMENT ON COLUMN "public"."customer_sessions"."phone_last4" IS 'Plain phone last-4 digits, stored only when the user authenticated with
   a legacy certificate that has no customer_phone_last4_hash. Used for
   backward-compat lookups. NULL for all new sessions.';

COMMENT ON COLUMN "public"."customer_sessions"."phone_last4_plain" IS 'Customer phone last4 digits (plain) stored for legacy fallback search; not exposed publicly.';

COMMENT ON COLUMN "public"."documents"."assigned_user_id" IS '施工担当者 (技術者) の auth.users id。技術者別パフォーマンス分析用。NULL は未割当。';

COMMENT ON COLUMN "public"."insurer_access_logs"."meta" IS 'json metadata';

COMMENT ON COLUMN "public"."reservations"."signoff_deadline" IS 'お客様不在時のサイン期限 (依頼時刻 + 24h の SLA)。';

COMMENT ON COLUMN "public"."signature_sessions"."certificate_id" IS '施工証明書 ID。施工証明書の署名の場合は必須。代理店契約書等は NULL。';

COMMENT ON COLUMN "public"."tenant_ai_automation_settings"."auto_actions" IS 'Per-tenant event-driven auto-actions (map of action_key -> bool). Empty/default = all OFF. Wall-3 actions (certificate issue / charge / send) are never executed regardless of this value.';

COMMENT ON COLUMN "public"."tenants"."custom_domain" IS 'Optional custom domain for public certificate pages. Example: cert.holy-auto.com (no scheme, no path)';

REVOKE ALL ON FUNCTION "public"."insurer_search_vehicles"(text, integer, integer, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."insurer_search_vehicles"(text, integer, integer, text, text, text) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."is_insurer_admin"() FROM PUBLIC;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."certificates_public" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoices" TO "anon", "authenticated", "postgres", "service_role";

ALTER TABLE "public"."certificates"
  ALTER COLUMN "public_id" SET DEFAULT public.generate_public_id();

ALTER TABLE "public"."vehicles"
  ALTER COLUMN "public_id" SET DEFAULT public.generate_vehicle_public_id();

