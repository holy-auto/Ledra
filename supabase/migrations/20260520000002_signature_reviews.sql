-- =============================================================
-- signature_reviews: 受領サイン完了直後の顧客レビュー
-- /sign/[token] の完了画面に表示するレビュー収集フローの永続化先。
-- 顧客は星評価 (1-5) + 任意コメントを送信できる。4 星以上の場合は
-- tenants.google_review_url が設定されていれば誘導する (高評価のみ
-- Google レビューへ誘導する一般的な定石)。
-- =============================================================

-- tenants に google_review_url を追加 (オプション、未設定なら誘導しない)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS google_review_url text;

COMMENT ON COLUMN tenants.google_review_url IS
  '顧客レビュー収集フローで 4 星以上の評価時に誘導する Google レビュー URL。空なら誘導しない。';

CREATE TABLE IF NOT EXISTS signature_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  signature_session_id uuid NOT NULL REFERENCES signature_sessions (id) ON DELETE CASCADE,
  certificate_id uuid REFERENCES certificates (id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers (id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  google_redirected_at timestamptz,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signature_reviews_session_uniq UNIQUE (signature_session_id)
);

COMMENT ON TABLE signature_reviews IS
  '受領サイン完了後に顧客が送信したレビュー (星評価 + 任意コメント)。';
COMMENT ON COLUMN signature_reviews.google_redirected_at IS
  '4 星以上で Google レビュー誘導ボタンを押した日時 (NULL = 未押下)。';

CREATE INDEX IF NOT EXISTS idx_signature_reviews_tenant
  ON signature_reviews (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signature_reviews_certificate
  ON signature_reviews (certificate_id) WHERE certificate_id IS NOT NULL;

ALTER TABLE signature_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signature_reviews_tenant_select ON signature_reviews;
DROP POLICY IF EXISTS signature_reviews_tenant_update ON signature_reviews;
DROP POLICY IF EXISTS signature_reviews_tenant_delete ON signature_reviews;

-- テナント所属メンバーのみ閲覧可。INSERT は service-role 経由 (公開 token フロー) のみ。
CREATE POLICY signature_reviews_tenant_select ON signature_reviews
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY signature_reviews_tenant_update ON signature_reviews
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

CREATE POLICY signature_reviews_tenant_delete ON signature_reviews
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );
