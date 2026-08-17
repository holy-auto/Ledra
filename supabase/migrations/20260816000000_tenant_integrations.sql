-- =============================================================================
-- tenant_integrations — 汎用 OAuth 連携ストア
--
-- 目的: 連携先を 1 つ増やすたびにテーブル・ルート・UI を作り直す運用をやめる。
--   これまでは Square (square_connections) / freee・MF (accounting_integrations)
--   / Google カレンダー (tenants 列) と、連携ごとに保存先も接続ルートも別物だった。
--   新しい連携を足すたびに DB マイグレーション + ルート + 画面が必要になり、
--   加盟店側も「開発者コンソールで ID・シークレットを発行して貼る」作業が残る。
--
--   このテーブルは Authorization Code 型の OAuth2 なら provider 定義
--   (src/lib/integrations/providers/*.ts) を 1 ファイル足すだけで接続できる
--   汎用の保存先。既存 3 系統は稼働中のためこの版では移行しない（併存）。
--
-- 設計メモ:
--   * provider に CHECK 制約を **意図的に置かない**。連携先追加のたびに
--     マイグレーションを書く運用こそが今回潰したいコストなので、値の妥当性は
--     アプリ側のレジストリ (isOAuthProvider) で担保する。
--   * トークンは accounting_integrations と同じ envelope 暗号化
--     (@/lib/crypto/tenantSecrets) の `_ciphertext` 列のみで保管。
--   * metadata は **非機密の表示用情報だけ**（例: Slack のワークスペース名・
--     投稿先チャンネル名）。RLS 上テナントの全メンバーが SELECT できるため、
--     秘密情報を入れてはいけない。
--   * RLS は accounting_integrations と同一形 — メンバー全員 SELECT、
--     INSERT/DELETE は owner/admin のみ。
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenant_integrations (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider                  text        NOT NULL,

  status                    text        NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'active', 'disconnected', 'error')),

  -- OAuth tokens (envelope-encrypted; @/lib/crypto/tenantSecrets 経由で読み書き)
  access_token_ciphertext   text,
  refresh_token_ciphertext  text,
  token_expires_at          timestamptz,

  -- 接続先アカウントの識別子 (Slack: team.id / 汎用: 事業所ID・アカウントID)
  external_account_id       text,
  external_account_name     text,

  -- 付与されたスコープ (再認可が必要かの判定に使う)
  scopes                    text[]      NOT NULL DEFAULT '{}',

  -- 非機密の表示用情報のみ。秘密情報は必ず _ciphertext 列へ。
  metadata                  jsonb       NOT NULL DEFAULT '{}'::jsonb,

  last_error                text,
  connected_at              timestamptz,
  connected_by              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_tenant_integrations_tenant_provider UNIQUE (tenant_id, provider)
);

-- uq_tenant_integrations_tenant_provider が (tenant_id, provider) を張るため
-- tenant_id 単独の検索はその index の先頭列で足りる。追加するのは
-- 「provider 横断で active な接続を集計する」運用クエリ用の部分 index のみ。
CREATE INDEX IF NOT EXISTS idx_tenant_integrations_active
  ON tenant_integrations(provider, status) WHERE status = 'active';

COMMENT ON TABLE tenant_integrations IS
  '加盟店 (テナント) × 外部サービスの汎用 OAuth 接続。provider 定義を 1 ファイル足すだけで連携先を増やせるようにするための保存先。';
COMMENT ON COLUMN tenant_integrations.provider IS
  'src/lib/integrations/registry.ts のレジストリ ID。連携先追加でマイグレーションが要らないよう CHECK 制約は意図的に置かない。';
COMMENT ON COLUMN tenant_integrations.metadata IS
  '非機密の表示用情報のみ (例: Slack のワークスペース名 / 投稿先チャンネル名)。テナントの全メンバーが SELECT できるため秘密情報を入れないこと。';

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY / CREATE TRIGGER には IF NOT EXISTS が無い。テーブルだけ先に
-- 存在する状態（MCP 等での直接適用、部分適用からの再実行）でこのファイルが
-- 走ると 42710 で落ち、db-migrate が以降すべて止まる。このリポジトリでは
-- 実際に db-migrate が13日間停止した前例があるため、必ず DROP ... IF EXISTS で
-- 冪等にしてから作る。
DROP POLICY IF EXISTS tenant_integrations_select ON tenant_integrations;
DROP POLICY IF EXISTS tenant_integrations_insert ON tenant_integrations;
DROP POLICY IF EXISTS tenant_integrations_update ON tenant_integrations;
DROP POLICY IF EXISTS tenant_integrations_delete ON tenant_integrations;

CREATE POLICY tenant_integrations_select ON tenant_integrations
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY tenant_integrations_insert ON tenant_integrations
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

CREATE POLICY tenant_integrations_update ON tenant_integrations
  FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY tenant_integrations_delete ON tenant_integrations
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

-- ─── updated_at trigger ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_tenant_integrations_updated_at ON tenant_integrations;
CREATE TRIGGER trg_tenant_integrations_updated_at
  BEFORE UPDATE ON tenant_integrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
