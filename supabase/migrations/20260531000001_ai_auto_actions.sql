-- AI 自動「アクション」設定 (auto-actions)。
--
-- 背景: tenant_ai_automation_settings.field_policies は「フィールドを AI が
-- 埋めるか」を制御するが、「人がフォームを開かなくてもワークフローを前に
-- 進めるか」(= イベント駆動の自動実行) を制御する手段が無かった。
--
-- このカラムはテナント単位で、auto-action key -> bool を保持する:
--   { "inbound_message.auto_extract": true,
--     "inbound_message.auto_create_reservation": true,
--     "certificate.auto_draft": true, ... }
--
-- - キーは src/lib/ai/automation/actionCatalog.ts の `key` を使う。
-- - 既定は '{}' (= 全アクション OFF)。opt-in しない限り挙動は変わらない。
-- - 壁3 (NEVER_AUTO_ACTIONS: 証明書発行 / 課金 / 外向き送付 / 顧客自動作成) は
--   アプリ層 (resolveAutoAction) と sanitizer が二重で弾くため、ここに true が
--   入っても自動実行されない。
-- - 不明キー / false は API 層 (sanitizeAutoActions) で捨てて永続化を小さく保つ。

ALTER TABLE tenant_ai_automation_settings
  ADD COLUMN IF NOT EXISTS auto_actions jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tenant_ai_automation_settings.auto_actions IS
  'Per-tenant event-driven auto-actions (map of action_key -> bool). Empty/default = all OFF. 壁3 actions (certificate issue / charge / send) are never executed regardless of this value.';
