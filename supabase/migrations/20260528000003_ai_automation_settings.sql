-- AI 自動入力 (AI automation) のテナント単位ポリシー設定。
--
-- 背景: 施工証明書発行 / 車両登録 / 案件 (Job) の各ワークフローには、
-- 既に AI 自動下書き (draftCertificate)・車検証 OCR (parse-shakken)・音声メモ整形
-- などの AI 入力支援が組み込まれている。しかし「どのフィールドを AI に任せ、
-- どれを人が手入力するか」をテナント毎に切り替える手段がなかった。
--
-- このテーブルはテナント単位で:
--   - field_policies: フィールド単位の policy
--       "auto"     = AI 出力をそのまま採用 (確認なしで反映)
--       "suggest"  = AI 出力を「提案」として見せ、人が承認 (デフォルト)
--       "manual"   = AI を呼ばない (フィールドは空のまま返す)
--   - confidence_threshold: AI 自己評価値の下限。下回ったフィールドは
--       実質 "suggest" にデモートされる (UI 側で reject 可能)
--   - source_policies: AI が参照可能なデータソースの ON/OFF
--       ("similar_certificates" / "hearings" / "photos" / "customer_history" など)
--   - enabled: グローバル ON/OFF。OFF にすると一切の AI 自動入力を停止する
--
-- キーは src/lib/ai/automation/fieldCatalog.ts の `key` を使う。
-- 不明なキーは API 層でサニタイズして捨てる (将来 catalog から外したキーが
-- DB に残ってもフォールトしないように)。
--
-- 書き込みは service-role (createTenantScopedAdmin) 経由を想定し、
-- 既存の tenant_feature_settings と同じく RLS は SELECT のみ。
-- (テナント所有者は自分のポリシーを読めるが、書き込みは API ルート経由のみ)

CREATE TABLE IF NOT EXISTS tenant_ai_automation_settings (
  tenant_id            uuid PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
  enabled              boolean NOT NULL DEFAULT true,
  field_policies       jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_threshold numeric(3, 2) NOT NULL DEFAULT 0.50
    CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1),
  source_policies      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by           uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenant_ai_automation_settings IS
  'Per-tenant AI auto-fill policy. field_policies = map of (workflow.field_key -> auto|suggest|manual). Empty/default = "suggest" for every field (AI proposes, user approves).';

ALTER TABLE tenant_ai_automation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_ai_automation_settings_select_own ON tenant_ai_automation_settings;
CREATE POLICY tenant_ai_automation_settings_select_own ON tenant_ai_automation_settings
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
