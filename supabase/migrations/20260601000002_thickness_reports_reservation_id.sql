-- Add reservation_id to thickness_reports so inspection-step automation
-- can look up reports for a specific reservation.
ALTER TABLE thickness_reports
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL;
