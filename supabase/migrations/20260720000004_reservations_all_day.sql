-- =============================================================
-- 終日予約 (all-day reservations)
-- 予約に all_day フラグを追加。終日予約は start_time / end_time を NULL で保存し、
-- 「その日を丸ごと占有する」予約として扱う（既存の null 時刻=終日の慣習に揃える）。
-- =============================================================

-- NOT NULL + DEFAULT false は定数デフォルトのためテーブル書き換えなし（PG11+ はメタデータ更新のみ）。
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false;

-- ─── ダブルブッキング判定に終日予約を含める ─────────────
-- 既存関数は start_time / end_time が NOT NULL の行だけを重複対象にしていたため、
-- 終日予約（時刻 NULL）が競合判定から漏れていた。all_day 行はその日のあらゆる
-- 時間帯と重複する（＝終日占有）ものとして扱う。
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
    AND (
      -- 終日予約はその日のどの時間帯とも競合する
      r.all_day
      -- 通常予約は時間帯が重なる場合のみ競合（境界は排他）
      OR (
        r.start_time IS NOT NULL
        AND r.end_time IS NOT NULL
        AND r.start_time < p_end_time
        AND r.end_time > p_start_time
      )
    )
    AND (p_exclude_id IS NULL OR r.id != p_exclude_id)
    AND (p_assigned_user_id IS NULL OR r.assigned_user_id = p_assigned_user_id);
END;
$$ LANGUAGE plpgsql STABLE;
