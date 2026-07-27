-- =============================================================
-- reservation_holds — 取引先による「枠の仮押さえ」（TTL付き）
--
-- 指名発注時に、発注元 A が受注店 B の空き枠を仮押さえする。B が受注承認すると
-- 本予約(reservations)へ変換し hold は accepted になる。承認前は仮押さえ、TTL 失効あり。
-- 空き計算・満席判定は reservationBlocksSlot（src/lib/booking/slots.ts）と同規則
-- （終日=all_day は当日全枠を占有 / 通常は排他境界の時間重なり）。
-- =============================================================

CREATE TABLE IF NOT EXISTS reservation_holds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,          -- 対象=B（枠の持ち主）
  held_by_tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,          -- 押さえる側=A
  job_order_id      uuid REFERENCES job_orders(id) ON DELETE CASCADE,                -- 指名オーダー
  scheduled_date    date NOT NULL,
  start_time        time NOT NULL,
  end_time          time NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','expired','cancelled','rejected')),
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holds_tenant_date ON reservation_holds(tenant_id, scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_holds_job_order   ON reservation_holds(job_order_id);
CREATE INDEX IF NOT EXISTS idx_holds_expiry      ON reservation_holds(status, expires_at);

ALTER TABLE reservation_holds ENABLE ROW LEVEL SECURITY;

-- 当事者（対象 B または 押さえる側 A）のメンバーは閲覧可。書き込みは SECURITY DEFINER
-- 関数 / サービスロール経由（どちらも RLS を迂回）で行う。
DROP POLICY IF EXISTS reservation_holds_select ON reservation_holds;
CREATE POLICY reservation_holds_select ON reservation_holds
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
    OR held_by_tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

CREATE TRIGGER trg_reservation_holds_updated_at
  BEFORE UPDATE ON reservation_holds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================
-- claim_reservation_hold — 枠の原子的な仮押さえ
--
-- (target, date, slot-start) ごとに advisory lock で直列化し、対象枠の max_bookings −
-- (占有 reservations + 有効 hold) を数えて、空きがあれば hold を INSERT する。
-- count→insert を臨界区間化して二重押さえ（オーバーセル）を防ぐ。
-- 既存の pos_checkout（20260323070000_scale_hardening.sql）と同じ advisory-lock 方式。
-- =============================================================
CREATE OR REPLACE FUNCTION public.claim_reservation_hold(
  p_target_tenant  uuid,
  p_held_by_tenant uuid,
  p_scheduled_date date,
  p_start_time     time,
  p_end_time       time,
  p_job_order_id   uuid,
  p_ttl_minutes    integer DEFAULT 2880   -- 48h
)
RETURNS TABLE (hold_id uuid, result text)  -- result in ('ok','full','no_slot')
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_max  integer;
  v_used integer;
  v_id   uuid;
BEGIN
  -- (1) (対象テナント, 日, 枠開始) を直列化。
  PERFORM pg_advisory_xact_lock(
    hashtext(p_target_tenant::text || '|' || p_scheduled_date::text || '|' || p_start_time::text)
  );

  -- (2) その時間帯を含む有効スロットの受付上限。
  SELECT s.max_bookings INTO v_max
  FROM public.external_booking_slots s
  WHERE s.tenant_id = p_target_tenant
    AND s.day_of_week = EXTRACT(dow FROM p_scheduled_date)::int   -- 0=日..6=土
    AND s.is_active = true
    AND s.start_time <= p_start_time
    AND s.end_time   >= p_end_time
  ORDER BY s.max_bookings DESC
  LIMIT 1;

  IF v_max IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'no_slot';
    RETURN;
  END IF;

  -- (3) 占有 = 当日の非キャンセル予約(終日 or 時間重なり) + 有効 hold(時間重なり)。
  --     reservationBlocksSlot と同規則。
  SELECT
    (SELECT count(*) FROM public.reservations r
       WHERE r.tenant_id = p_target_tenant
         AND r.scheduled_date = p_scheduled_date
         AND r.status <> 'cancelled'
         AND (
           r.all_day = true
           OR (r.start_time IS NOT NULL AND r.end_time IS NOT NULL
               AND r.start_time < p_end_time AND r.end_time > p_start_time)
         ))
  + (SELECT count(*) FROM public.reservation_holds h
       WHERE h.tenant_id = p_target_tenant
         AND h.scheduled_date = p_scheduled_date
         AND h.status = 'pending'
         AND h.expires_at > now()
         AND h.start_time < p_end_time AND h.end_time > p_start_time)
  INTO v_used;

  IF v_used >= v_max THEN
    RETURN QUERY SELECT NULL::uuid, 'full';
    RETURN;
  END IF;

  INSERT INTO public.reservation_holds
    (tenant_id, held_by_tenant_id, job_order_id, scheduled_date, start_time, end_time, status, expires_at)
  VALUES
    (p_target_tenant, p_held_by_tenant, p_job_order_id, p_scheduled_date, p_start_time, p_end_time,
     'pending', now() + make_interval(mins => p_ttl_minutes))
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, 'ok';
END;
$$;

-- 一般ユーザーからの直接 RPC（取引先ゲート迂回）を禁止し、サーバ(service_role)からのみ実行可に。
REVOKE ALL ON FUNCTION public.claim_reservation_hold(uuid, uuid, date, time, time, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reservation_hold(uuid, uuid, date, time, time, uuid, integer)
  TO service_role;
