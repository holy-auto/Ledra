-- =============================================================
-- 外部予約設定: 定休日 + スロット自由編集対応
-- =============================================================

-- ─── external_booking_slots に label 列を追加（自由編集用メモ） ─────────────
ALTER TABLE external_booking_slots
  ADD COLUMN IF NOT EXISTS label text,           -- スロットの表示名（例: "午前の部"）
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ─── 定休日テーブル ─────────────────────────────────────────────
-- 2種類の定休日を管理:
--   type = 'weekly'   : 毎週同曜日の定休 (day_of_week を使用)
--   type = 'specific' : 特定日の定休   (closed_date を使用)

CREATE TABLE IF NOT EXISTS closed_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  type text NOT NULL DEFAULT 'specific'
    CHECK (type IN ('weekly', 'specific')),

  day_of_week integer                           -- 0=日曜〜6=土曜 (weekly 時のみ)
    CHECK (day_of_week BETWEEN 0 AND 6),

  closed_date date,                             -- 特定日 (specific 時のみ)

  note text,                                    -- 備考（例: "年末年始"）

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- 同一テナント内でのユニーク制約
  UNIQUE (tenant_id, type, day_of_week),        -- weekly の重複防止
  UNIQUE (tenant_id, closed_date)               -- specific の重複防止
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_closed_days_tenant ON closed_days(tenant_id);
CREATE INDEX IF NOT EXISTS idx_closed_days_date   ON closed_days(closed_date) WHERE closed_date IS NOT NULL;

ALTER TABLE closed_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY closed_days_tenant_all ON closed_days
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

-- ─── updated_at 自動更新トリガー ─────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_closed_days_updated_at'
  ) THEN
    CREATE TRIGGER trg_closed_days_updated_at
      BEFORE UPDATE ON closed_days
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_external_slots_updated_at'
  ) THEN
    CREATE TRIGGER trg_external_slots_updated_at
      BEFORE UPDATE ON external_booking_slots
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
