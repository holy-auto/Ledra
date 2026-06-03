-- =============================================================================
-- 部品装着インテグリティ — Phase 1: 完全凍結ガード / 追記専用 / シリアル照合
--
-- 設計: docs/parts-installation-integrity-design.md §6.3 / §6.4.4 / §6.4.5 / §6.2
--
-- すべて既存 supply_partners_guard と同じ
--   SECURITY DEFINER + SET search_path = '' パターン。
-- search_path='' のため、全オブジェクトを public. で完全修飾する。
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 保証グレードの充足判定（actual が required 以上か）
--   ランク: customer_otp(3) > store_contact_otp(2) > in_store_tablet(1)
--   required: 'customer_otp'(3) / 'store_contact_otp'(2) / 'any'(1)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.part_assurance_rank(level text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE level
    WHEN 'customer_otp'      THEN 3
    WHEN 'store_contact_otp' THEN 2
    WHEN 'in_store_tablet'   THEN 1
    WHEN 'any'               THEN 1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.part_meets_required_assurance(actual text, required text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public.part_assurance_rank(actual) >= public.part_assurance_rank(required);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- part_installations 完全凍結ガード
--   - DELETE: customer_verified / voided は不可。
--   - UPDATE:
--       * OLD=customer_verified → status→voided（理由必須・不変列は据え置き）のみ許可、他は全拒否。
--       * OLD=voided            → 全拒否。
--       * installed→customer_verified への遷移は §6.4.4 のゲートを満たす必要あり
--         （署名済み・document_hash 一致・電話フル番号ハッシュ一致・保証グレード充足）。
--   service-role(auth.uid() IS NULL) も例外にしない＝完全凍結。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.part_installations_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_part_installations_guard ON part_installations;
CREATE TRIGGER trg_part_installations_guard
  BEFORE UPDATE OR DELETE ON part_installations
  FOR EACH ROW EXECUTE FUNCTION public.part_installations_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- part_installation_evidence 追記専用（UPDATE/DELETE を常時拒否）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.part_evidence_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'part_installation_evidence: 追記専用です。更新・削除はできません (id=%)',
    COALESCE(OLD.id, NEW.id);
END;
$$;

DROP TRIGGER IF EXISTS trg_part_evidence_append_only ON part_installation_evidence;
CREATE TRIGGER trg_part_evidence_append_only
  BEFORE UPDATE OR DELETE ON part_installation_evidence
  FOR EACH ROW EXECUTE FUNCTION public.part_evidence_append_only();

-- ─────────────────────────────────────────────────────────────────────────────
-- part_serial_registry 追記専用（消費記録の改ざん/抹消を防ぐ）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.part_serial_registry_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'part_serial_registry: 追記専用です。更新・削除はできません (fingerprint=%)',
    COALESCE(OLD.serial_fingerprint, NEW.serial_fingerprint);
END;
$$;

DROP TRIGGER IF EXISTS trg_part_serial_registry_append_only ON part_serial_registry;
CREATE TRIGGER trg_part_serial_registry_append_only
  BEFORE UPDATE OR DELETE ON part_serial_registry
  FOR EACH ROW EXECUTE FUNCTION public.part_serial_registry_append_only();

-- ─────────────────────────────────────────────────────────────────────────────
-- part_confirmation_signatures: signed 後は不変（DELETE は常時不可）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.part_confirmation_signatures_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'part_confirmation_signatures: 署名レコードは削除できません (id=%)', OLD.id;
  END IF;
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'part_confirmation_signatures: 署名完了後は変更できません (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_part_conf_sig_guard ON part_confirmation_signatures;
CREATE TRIGGER trg_part_conf_sig_guard
  BEFORE UPDATE OR DELETE ON part_confirmation_signatures
  FOR EACH ROW EXECUTE FUNCTION public.part_confirmation_signatures_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- シリアル全体横断の衝突照合＋登録（生シリアルを開示しない SECURITY DEFINER 関数）
--   返り値: 'registered'（新規=使い回しなし） / 'reused'（既存衝突=使い回し疑い）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.part_register_serial(
  p_fingerprint    text,
  p_tenant_id      uuid,
  p_installation_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.part_register_serial(text, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.part_register_serial(text, uuid, uuid) TO authenticated, service_role;
