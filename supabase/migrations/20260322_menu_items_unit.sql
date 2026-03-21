-- Add unit field to menu_items
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS unit text DEFAULT '式';
