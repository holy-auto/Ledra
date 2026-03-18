-- =============================================================
-- Google Calendar 連携 + LINE 連携 + ダブルブッキング防止
-- =============================================================

-- ─── テナントに Google Calendar / LINE 設定を追加 ─────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS gcal_refresh_token text,           -- Google OAuth refresh token（暗号化推奨）
  ADD COLUMN IF NOT EXISTS gcal_calendar_id text,             -- 同期先カレンダーID
  ADD COLUMN IF NOT EXISTS gcal_sync_enabled boolean DEFAULT false,

  ADD COLUMN IF NOT EXISTS line_channel_id text,              -- LINE Messaging API Channel ID
  ADD COLUMN IF NOT EXISTS line_channel_secret text,          -- LINE Channel Secret
  ADD COLUMN IF NOT EXISTS line_channel_access_token text,    -- LINE Channel Access Token
  ADD COLUMN IF NOT EXISTS line_liff_id text,                 -- LIFF アプリ ID
  ADD COLUMN IF NOT EXISTS line_enabled boolean DEFAULT false;

-- ─── 予約テーブルに外部連携フィールドを追加 ─────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS gcal_event_id text,                -- Google Calendar イベントID
  ADD COLUMN IF NOT EXISTS line_user_id text,                 -- LINE 予約者の user ID
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual'       -- 予約経路: manual / google_maps / line / web
    CHECK (source IN ('manual', 'google_maps', 'line', 'web'));

CREATE INDEX IF NOT EXISTS idx_reservations_gcal ON reservations(gcal_event_id) WHERE gcal_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_line ON reservations(line_user_id) WHERE line_user_id IS NOT NULL;

-- ─── ダブルブッキング防止: 同一テナント・同日・重複時間帯チェック関数 ─────────────
CREATE OR REPLACE FUNCTION check_reservation_overlap(
  p_tenant_id uuid,
  p_scheduled_date date,
  p_start_time time,
  p_end_time time,
  p_exclude_id uuid DEFAULT NULL,
  p_assigned_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  overlapping_id uuid,
  overlapping_title text,
  overlapping_start time,
  overlapping_end time
) AS $$
BEGIN
  RETURN QUERY
  SELECT r.id, r.title, r.start_time, r.end_time
  FROM reservations r
  WHERE r.tenant_id = p_tenant_id
    AND r.scheduled_date = p_scheduled_date
    AND r.status NOT IN ('cancelled', 'completed')
    AND r.start_time IS NOT NULL
    AND r.end_time IS NOT NULL
    AND r.start_time < p_end_time
    AND r.end_time > p_start_time
    AND (p_exclude_id IS NULL OR r.id != p_exclude_id)
    AND (p_assigned_user_id IS NULL OR r.assigned_user_id = p_assigned_user_id);
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── Google Calendar 同期ログ ─────────────
CREATE TABLE IF NOT EXISTS gcal_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'pull')),
  gcal_event_id text,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error')),
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gcal_sync_log_tenant ON gcal_sync_log(tenant_id);

ALTER TABLE gcal_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY gcal_sync_log_tenant_select ON gcal_sync_log
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

-- ─── LINE 連携用: 顧客テーブルに LINE user_id を追加 ─────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS line_user_id text;

CREATE INDEX IF NOT EXISTS idx_customers_line ON customers(line_user_id) WHERE line_user_id IS NOT NULL;

-- ─── Reserve with Google: 外部予約受付テーブル ─────────────
CREATE TABLE IF NOT EXISTS external_booking_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- 営業時間スロット定義
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=日曜
  start_time time NOT NULL,
  end_time time NOT NULL,
  max_bookings integer NOT NULL DEFAULT 1,    -- 同時予約上限
  is_active boolean DEFAULT true,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_slots_tenant ON external_booking_slots(tenant_id);

ALTER TABLE external_booking_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY external_slots_tenant_all ON external_booking_slots
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );
