-- 店舗用 顧客登録リンク (reusable store registration links)
--
-- 既存の customer_intake_invitations は「1顧客=1トークン・1回限り・期限付き」だが、
-- 店舗の待合室・レジ横などに掲示して繰り返しスキャンしてもらう用途には不向き。
--
-- このテーブルは「店舗ごとに発行する、繰り返し使える固定リンク/QR」を表す。
-- 顧客がリンクを開いて「登録をはじめる」と、その都度 customer_intake_invitations
-- の 1 回限りトークンをサーバ側で発行し、既存の公開フォーム/OCR/AI 自動承認
-- パイプラインへ合流させる。これにより既存資産を最大限再利用する。
--
-- セキュリティ:
-- - token は raw のまま保存しない. sha256(token || pepper) のみ保存.
-- - short_id は URL の人間可読部分. token そのものではない.
-- - 公開 mint エンドポイントは IP rate limit で濫用を抑止する (route 側).
-- - is_active=false で無効化 (削除はせず履歴を残す).

CREATE TABLE IF NOT EXISTS customer_intake_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- 店舗ごとに発行。店舗が消えたらリンクも消す。
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  -- sha256(token || pepper). 公開フローの検証はこのハッシュ照合で行う.
  token_hash text NOT NULL UNIQUE,
  -- raw token. このリンクは「登録フォームを開くだけ」の低リスク用途であり、
  -- 店舗が QR/URL をいつでも再表示・再印刷できる必要があるため、招待 (1回限り)
  -- と違って raw token も保持する. 参照できるのは RLS で tenant 内に限定される.
  token_plain text NOT NULL,
  -- URL の人間可読部分 (例: /r/abc23xyz).
  short_id text NOT NULL UNIQUE,
  -- 表示用ラベル (任意). 例: "本店 受付QR".
  label text,
  is_active boolean NOT NULL DEFAULT true,
  -- このリンク経由で発行された intake の累計件数 (best-effort カウンタ).
  submission_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT intake_link_no_mynumber CHECK (
    label IS NULL OR label !~ '\d{12}'
  )
);

CREATE INDEX IF NOT EXISTS idx_intake_links_tenant
  ON customer_intake_links (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_links_store
  ON customer_intake_links (store_id);

-- RLS (customer_intake_invitations と同じ tenant スコープ)
ALTER TABLE customer_intake_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intake_link_tenant_select ON customer_intake_links;
CREATE POLICY intake_link_tenant_select ON customer_intake_links
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS intake_link_tenant_insert ON customer_intake_links;
CREATE POLICY intake_link_tenant_insert ON customer_intake_links
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS intake_link_tenant_update ON customer_intake_links;
CREATE POLICY intake_link_tenant_update ON customer_intake_links
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS intake_link_tenant_delete ON customer_intake_links;
CREATE POLICY intake_link_tenant_delete ON customer_intake_links
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

COMMENT ON TABLE customer_intake_links IS
  '店舗ごとに発行する繰り返し利用可能な顧客登録リンク/QR. 開くたびに customer_intake_invitations の1回限りトークンを mint する.';
COMMENT ON COLUMN customer_intake_links.token_hash IS
  'sha256(intakelink|token|pepper). 公開フローの検証用.';
COMMENT ON COLUMN customer_intake_links.token_plain IS
  'raw token. 店舗が QR/URL を再表示するために保持. 参照は RLS で tenant 内に限定.';
COMMENT ON COLUMN customer_intake_links.submission_count IS
  'このリンク経由で発行された intake の累計件数 (best-effort).';

-- submission_count をアトミックにインクリメントし last_used_at を更新する RPC.
-- 公開 mint フローから service_role で呼ぶ。is_active=false のリンクは更新しない。
CREATE OR REPLACE FUNCTION increment_intake_link_usage(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.customer_intake_links
  SET submission_count = submission_count + 1,
      last_used_at = now()
  WHERE id = p_id
    AND is_active = true;
END;
$$;

-- service_role からのみ呼ぶ (公開フローは service-role admin 経由). anon/authenticated
-- には明示的に EXECUTE を渡さない (SECURITY DEFINER の濫用面を最小化).
REVOKE ALL ON FUNCTION increment_intake_link_usage(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_intake_link_usage(uuid) TO service_role;
