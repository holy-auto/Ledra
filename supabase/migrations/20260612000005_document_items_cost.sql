-- items_json の各アイテムに cost_price が追加された（アプリレイヤー変更のみ）
-- JSONB のため DB マイグレーション不要だが、将来の参照用にバージョンを記録
comment on column documents.items_json is
  'Line items array. Each item: {id, type, name, quantity, unit, unit_price, cost_price, tax_category, menu_item_id, note}. cost_price added 2026-06.';
