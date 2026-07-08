-- =============================================================
-- 受付スロットごとの「受入可否」— 作業内容（品目マスタの大カテゴリ）で絞る
--
-- 背景:
--   各作業ごとに「洗車のみ可」「預かり可」等、時間帯によって受け入れる作業内容を
--   変えたい。人手が空くタイミングに合わせて受入可否を細かく制御し機会損失を防ぐ。
--
-- 設計:
--   タクソノミーは既存の menu_items.category_large（大カテゴリ）を流用し、
--   専用マスタは持たない（表記ゆれは品目マスタ側のサジェストで緩やかに担保）。
--   external_booking_slots.accepted_categories に受入対象の大カテゴリを配列で持つ。
--     - NULL / 空配列 = すべての作業を受け入れる（従来どおり）
--     - 1件以上      = その大カテゴリの作業のみ受け入れる（複数指定＝複合受付）
-- =============================================================

ALTER TABLE external_booking_slots
  ADD COLUMN IF NOT EXISTS accepted_categories text[];

COMMENT ON COLUMN external_booking_slots.accepted_categories IS
  '受け入れる作業の大カテゴリ（menu_items.category_large）。NULL/空=すべて受入。複数指定=複合受付。';
