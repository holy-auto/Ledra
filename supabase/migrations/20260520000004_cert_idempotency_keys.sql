-- =============================================================
-- cert_idempotency_keys: クライアント発の証明書冪等キー → public_id 解決表
--
-- 用途: オフライン Outbox で証明書発行 → 写真アップロードを連鎖実行する際、
-- 写真アップロード時点で server-side cert public_id を解決するためのマッピング。
--
-- 設計判断:
--   - withIdempotency (Redis-backed) の cache key は callerId(IP) を含むため、
--     reconnect で IP が変わると引けない。本表は IP に依存しない永続マッピング。
--   - tenant_id を持って RLS でテナント境界を守る。
--   - cron でクリーンアップする想定 (30 日 TTL)。テーブル自体は小さい
--     (1 cert あたり 1 行、key/uuid のみ) のでメンテ負荷は最小。
-- =============================================================

CREATE TABLE IF NOT EXISTS cert_idempotency_keys (
  idempotency_key text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  certificate_id uuid NOT NULL REFERENCES certificates (id) ON DELETE CASCADE,
  public_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

COMMENT ON TABLE cert_idempotency_keys IS
  'クライアントが発行した cert 作成の idempotency-key と server-side public_id の永続マッピング。オフライン写真アップロード時に public_id を逆引きする。';
COMMENT ON COLUMN cert_idempotency_keys.expires_at IS
  'cron での GC ヒント。マッピング自体は cert より長く保持しても害は無いが容量増を避ける。';

CREATE INDEX IF NOT EXISTS idx_cert_idempotency_keys_tenant
  ON cert_idempotency_keys (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cert_idempotency_keys_expires
  ON cert_idempotency_keys (expires_at);

ALTER TABLE cert_idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cert_idempotency_keys_tenant_select ON cert_idempotency_keys;
CREATE POLICY cert_idempotency_keys_tenant_select ON cert_idempotency_keys
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

-- INSERT は cert 作成 API (service-role 経由) のみ。クライアントから直接の書き込み禁止。
