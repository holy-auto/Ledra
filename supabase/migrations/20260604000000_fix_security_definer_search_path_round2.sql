-- Round 2: harden SECURITY DEFINER / privileged functions against search_path
-- hijacking by pinning `SET search_path = ''` and fully schema-qualifying every
-- object reference inside the body.
--
-- Background: 20260404000000_fix_security_definer_search_path.sql standardized
-- most functions on `search_path = ''`, but a few shipped later with
-- `SET search_path = public` (or unqualified bodies). With `public` in the
-- search_path and an unqualified table reference, a role able to create an
-- object earlier in the resolution order could shadow the intended table.
-- Pinning to '' + qualifying references removes that ambiguity entirely.
-- See docs/AUDIT_REPORT_20260604.md (MEDIUM-4).
--
-- CREATE OR REPLACE preserves existing ownership and grants, so the original
-- REVOKE/GRANT statements remain in effect.

-- 1) super_admin 判定ヘルパー (RLS が依存) — SQL, was SET search_path = public
CREATE OR REPLACE FUNCTION is_super_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND role = 'super_admin'
  );
$$;

-- 2) intake OCR 試行回数のアトミック加算 — plpgsql, was SET search_path = public
CREATE OR REPLACE FUNCTION increment_intake_ocr_attempts(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_next integer;
BEGIN
  UPDATE public.customer_intake_invitations
  SET ocr_attempts = ocr_attempts + 1
  WHERE id = p_id
    AND status = 'pending'
    AND ocr_attempts < 10
  RETURNING ocr_attempts INTO v_next;

  RETURN v_next IS NOT NULL;
END;
$$;

-- 3) 在庫移動の適用 — plpgsql, SECURITY INVOKER (RLS が tenant を絞る前提).
--    DEFINER ではないが、無修飾参照 + search_path = public のハードニング漏れ。
CREATE OR REPLACE FUNCTION apply_inventory_movement(
  p_item_id uuid,
  p_type text,
  p_quantity numeric,
  p_reason text DEFAULT NULL,
  p_reservation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_item public.inventory_items%ROWTYPE;
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
  SELECT * INTO v_item FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;
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

  UPDATE public.inventory_items
    SET current_stock = v_new_stock
    WHERE id = v_item.id;

  v_user_id := auth.uid();

  INSERT INTO public.inventory_movements(tenant_id, item_id, type, quantity, reason, reservation_id, created_by)
    VALUES (v_item.tenant_id, v_item.id, p_type, p_quantity, p_reason, p_reservation_id, v_user_id)
    RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'movement_id', v_movement_id,
    'item_id', v_item.id,
    'previous_stock', v_item.current_stock,
    'new_stock', v_new_stock
  );
END;
$$;

-- 4) 紹介リンクのクリック加算 — SQL, was SET search_path = public
CREATE OR REPLACE FUNCTION increment_referral_link_click(p_code text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.agent_referral_links
     SET click_count = coalesce(click_count, 0) + 1,
         updated_at  = now()
   WHERE code = p_code
     AND is_active = true;
$$;
