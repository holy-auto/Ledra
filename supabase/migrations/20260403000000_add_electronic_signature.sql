-- ============================================================
-- Ledra 電子署名機能 マイグレーション
-- 電子署名法（平成12年法律第102号）第2条・第3条 準拠
-- ============================================================

-- ============================================================
-- 1. signature_sessions テーブル
--    電子署名セッション管理（ワンタイムURL、署名証跡）
-- ============================================================
CREATE TABLE IF NOT EXISTS signature_sessions (
  -- 基本情報
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id          UUID NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- ワンタイムURL用トークン（UUID v4、24文字エントロピー）
  token                   TEXT UNIQUE NOT NULL,
  expires_at              TIMESTAMPTZ NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'signed', 'expired', 'cancelled')),

  -- 署名対象の文書ハッシュ（電子署名法第2条第2号：非改ざん性の核心）
  document_hash           TEXT NOT NULL,
  document_hash_alg       TEXT NOT NULL DEFAULT 'SHA-256',

  -- 署名依頼情報
  signer_name             TEXT,
  signer_email            TEXT,
  signer_phone            TEXT,
  notification_method     TEXT NOT NULL DEFAULT 'line'
                          CHECK (notification_method IN ('line', 'email', 'sms')),
  notification_sent_at    TIMESTAMPTZ,

  -- 署名完了情報（電子署名法第2条第1号：本人性の証跡）
  signed_at               TIMESTAMPTZ,
  signer_ip               TEXT,
  signer_user_agent       TEXT,
  signer_confirmed_email  TEXT,

  -- 暗号署名データ（電子署名法第2条第2号：非改ざん性の技術実装）
  signature               TEXT,
  signing_payload         TEXT,
  public_key_fingerprint  TEXT,
  key_version             TEXT,

  -- 管理
  created_by              UUID REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at            TIMESTAMPTZ,
  cancel_reason           TEXT
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_signature_sessions_token
  ON signature_sessions(token);
CREATE INDEX IF NOT EXISTS idx_signature_sessions_certificate_id
  ON signature_sessions(certificate_id);
CREATE INDEX IF NOT EXISTS idx_signature_sessions_tenant_id
  ON signature_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_signature_sessions_status
  ON signature_sessions(status);
CREATE INDEX IF NOT EXISTS idx_signature_sessions_expires_at
  ON signature_sessions(expires_at)
  WHERE status = 'pending';

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_signature_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_signature_sessions_updated_at ON signature_sessions;
CREATE TRIGGER trg_signature_sessions_updated_at
  BEFORE UPDATE ON signature_sessions
  FOR EACH ROW EXECUTE FUNCTION update_signature_sessions_updated_at();

-- Row Level Security
ALTER TABLE signature_sessions ENABLE ROW LEVEL SECURITY;

-- テナントメンバーは自テナントのセッションのみ参照可
DROP POLICY IF EXISTS "signature_sessions_tenant_select" ON signature_sessions;
CREATE POLICY "signature_sessions_tenant_select"
  ON signature_sessions FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships
      WHERE user_id = auth.uid()
    )
  );

-- テナントメンバーのみ作成可
DROP POLICY IF EXISTS "signature_sessions_tenant_insert" ON signature_sessions;
CREATE POLICY "signature_sessions_tenant_insert"
  ON signature_sessions FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships
      WHERE user_id = auth.uid()
    )
  );

-- 更新はサービスロール（API Routes で getSupabaseAdmin() 使用）のみ
DROP POLICY IF EXISTS "signature_sessions_service_update" ON signature_sessions;
CREATE POLICY "signature_sessions_service_update"
  ON signature_sessions FOR UPDATE
  USING (auth.role() = 'service_role');


-- ============================================================
-- 2. signature_audit_logs テーブル
--    全アクセスイベントの追記専用監査ログ
-- ============================================================
CREATE TABLE IF NOT EXISTS signature_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES signature_sessions(id) ON DELETE CASCADE,
  event       TEXT NOT NULL
              CHECK (event IN (
                'session_created',
                'notification_sent',
                'page_opened',
                'signed',
                'verified',
                'expired',
                'cancelled'
              )),
  ip          TEXT,
  user_agent  TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_signature_audit_logs_session_id
  ON signature_audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_signature_audit_logs_event
  ON signature_audit_logs(event);
CREATE INDEX IF NOT EXISTS idx_signature_audit_logs_created_at
  ON signature_audit_logs(created_at DESC);

-- Row Level Security（追記専用 — UPDATE・DELETE は一切不可）
ALTER TABLE signature_audit_logs ENABLE ROW LEVEL SECURITY;

-- サービスロールのみ INSERT 可
DROP POLICY IF EXISTS "audit_logs_service_insert" ON signature_audit_logs;
CREATE POLICY "audit_logs_service_insert"
  ON signature_audit_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- テナントメンバーは自テナントのセッションに紐づくログのみ参照可
DROP POLICY IF EXISTS "audit_logs_tenant_select" ON signature_audit_logs;
CREATE POLICY "audit_logs_tenant_select"
  ON signature_audit_logs FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM signature_sessions
      WHERE tenant_id IN (
        SELECT tenant_id FROM tenant_memberships
        WHERE user_id = auth.uid()
      )
    )
  );

-- UPDATE・DELETE は全ロール禁止（追記専用ポリシー）
DROP POLICY IF EXISTS "audit_logs_no_update" ON signature_audit_logs;
CREATE POLICY "audit_logs_no_update"
  ON signature_audit_logs FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "audit_logs_no_delete" ON signature_audit_logs;
CREATE POLICY "audit_logs_no_delete"
  ON signature_audit_logs FOR DELETE
  USING (false);


-- ============================================================
-- 3. signature_public_keys テーブル
--    公開鍵の管理（鍵ローテーション後も過去署名を検証可能にする）
-- ============================================================
CREATE TABLE IF NOT EXISTS signature_public_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_version     TEXT UNIQUE NOT NULL,   -- 'v1', 'v2', ...
  public_key      TEXT NOT NULL,          -- PEM 形式 ECDSA P-256 公開鍵
  fingerprint     TEXT NOT NULL,          -- SHA-256(DER) HEX
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 公開鍵は誰でも参照可能（第三者による署名検証のため）
ALTER TABLE signature_public_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_keys_public_read" ON signature_public_keys;
CREATE POLICY "public_keys_public_read"
  ON signature_public_keys FOR SELECT
  USING (true);

-- 書き込みはサービスロールのみ
DROP POLICY IF EXISTS "public_keys_service_write" ON signature_public_keys;
CREATE POLICY "public_keys_service_write"
  ON signature_public_keys FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "public_keys_service_update" ON signature_public_keys;
CREATE POLICY "public_keys_service_update"
  ON signature_public_keys FOR UPDATE
  USING (auth.role() = 'service_role');


-- ============================================================
-- コメント（テーブル説明）
-- ============================================================
COMMENT ON TABLE signature_sessions IS
  '電子署名セッション管理テーブル。電子署名法第2条第1号（本人性）・第2号（非改ざん性）の証跡を保持する。';

COMMENT ON COLUMN signature_sessions.document_hash IS
  '署名対象PDFのSHA-256ハッシュ（HEX）。電子署名法第2条第2号（非改ざん性）の核心。';

COMMENT ON COLUMN signature_sessions.signature IS
  'ECDSA P-256 による署名値（Base64）。signing_payload に対して LEDRA_SIGNING_PRIVATE_KEY で署名したもの。';

COMMENT ON COLUMN signature_sessions.signing_payload IS
  '署名ペイロードの正規化文字列。"ledra-signature-v1:{document_hash}:{signed_at}:{signer_email}:{certificate_id}:{session_id}" の形式。';

COMMENT ON TABLE signature_audit_logs IS
  '電子署名の全アクセスイベントを記録する追記専用監査テーブル。UPDATE・DELETEはRLSで禁止。';

COMMENT ON TABLE signature_public_keys IS
  'ECDSA署名検証用の公開鍵管理テーブル。鍵ローテーション後も key_version で過去の署名を検証可能。';
