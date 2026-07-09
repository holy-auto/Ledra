-- =============================================================
-- 撮影時来歴（capture-time provenance）Phase 1 — 封印基盤
--
-- 目的: 写真真正性の「担保」を撮影の瞬間に取れるようにするための下地。
--   1) certificate_images に、除去前ハッシュ・TSA時刻署名・撮影nonce・
--      端末アテステーショントークンハッシュ・非担保理由の列を追加（全て nullable）。
--   2) photo_capture_nonces: cert 作成時にサーバ発行する単回nonceの永続表
--      （cert_idempotency_keys を鋳型）。
--   3) consume_photo_capture_nonce: 行ロックで「検査＋単回消費」を原子化する RPC
--      （part_verify_otp を鋳型）。
--
-- 全て後方互換（既定 no-op / nullable）。グレードは Phase 1 では動かない。
-- =============================================================

-- ── 1) certificate_images 列追加（20260411000000 の nullable 踏襲）──────────────
ALTER TABLE certificate_images
  ADD COLUMN IF NOT EXISTS capture_nonce                 text,
  ADD COLUMN IF NOT EXISTS original_sha256               text,
  ADD COLUMN IF NOT EXISTS tsa_token                     bytea,
  ADD COLUMN IF NOT EXISTS tsa_authority                 text,
  ADD COLUMN IF NOT EXISTS tsa_timestamp_at              timestamptz,
  ADD COLUMN IF NOT EXISTS device_attestation_token_hash text,
  ADD COLUMN IF NOT EXISTS capture_binding_reason        text;

COMMENT ON COLUMN certificate_images.original_sha256 IS
  'GPS/EXIF 除去・再エンコード前の原本バイトの SHA-256。紛争時に顧客提出の原本と照合する。';
COMMENT ON COLUMN certificate_images.tsa_token IS
  'RFC3161 タイムスタンプトークン (CMS ContentInfo DER)。sha256 に対する存在時刻の署名。';
COMMENT ON COLUMN certificate_images.capture_binding_reason IS
  '担保ティアに達しなかった監査理由: offline_no_nonce / attestation_failed / gallery_upload / legacy 等。';

-- ── 2) photo_capture_nonces（cert_idempotency_keys を鋳型）────────────────────
CREATE TABLE IF NOT EXISTS photo_capture_nonces (
  nonce           text PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  certificate_id  uuid NOT NULL REFERENCES certificates (id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'issued',   -- 'issued' | 'consumed'
  device_key_hash text,                             -- 消費時に記録（発行時は NULL）
  consumed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  CONSTRAINT photo_capture_nonces_status_chk CHECK (status IN ('issued', 'consumed'))
);

COMMENT ON TABLE photo_capture_nonces IS
  'cert 作成時にサーバ発行する単回撮影nonce。写真アップロード時に cert+tenant 束縛で原子的に消費し、撮影時来歴の「新鮮さ」を担保する。';
COMMENT ON COLUMN photo_capture_nonces.expires_at IS
  'cron GC ヒント兼、発行→撮影の窓の上限（既定 15 分）。期限切れ nonce は消費不可。';

CREATE INDEX IF NOT EXISTS idx_photo_capture_nonces_cert
  ON photo_capture_nonces (certificate_id);
CREATE INDEX IF NOT EXISTS idx_photo_capture_nonces_expires
  ON photo_capture_nonces (expires_at);

-- nonce は「サーバ発行の bearer 秘密」であり、cert 作成レスポンスで発行先クライアントに
-- だけ渡す。テナントに SELECT を許すと、他 cert 用の未消費 nonce を列挙して任意アップロードに
-- 添付でき単回束縛を崩せる（cert_idempotency_keys はクライアント発の非秘密キーなので露出可、
-- という違い）。よって RLS 有効のまま **ポリシーを一切作らず**、発行/消費は service-role
-- (captureNonce.ts) 経由のみに限定して deny-all にする。
ALTER TABLE photo_capture_nonces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS photo_capture_nonces_tenant_select ON photo_capture_nonces;

-- ── 3) 原子的消費 RPC（part_verify_otp を鋳型: FOR UPDATE で直列化）───────────
CREATE OR REPLACE FUNCTION public.consume_photo_capture_nonce(
  p_nonce           text,
  p_tenant_id       uuid,
  p_certificate_id  uuid,
  p_device_key_hash text
)
RETURNS text  -- 'ok' | 'consumed' | 'expired' | 'mismatch' | 'not_found'
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.photo_capture_nonces%ROWTYPE;
BEGIN
  -- 同一 nonce 行を直列化（並行アップロードによる二重消費レースを排除）。
  SELECT * INTO v_row
  FROM public.photo_capture_nonces
  WHERE nonce = p_nonce AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_row.status <> 'issued' THEN
    RETURN 'consumed';  -- 既に単回消費済み（= リプレイ）。
  END IF;

  IF v_row.expires_at < now() THEN
    RETURN 'expired';
  END IF;

  -- 別証明書の写真を流用しようとした場合（nonce は cert に束縛）。
  IF v_row.certificate_id <> p_certificate_id THEN
    RETURN 'mismatch';
  END IF;

  UPDATE public.photo_capture_nonces
  SET status          = 'consumed',
      consumed_at     = now(),
      device_key_hash = p_device_key_hash
  WHERE nonce = v_row.nonce;

  RETURN 'ok';
END;
$$;

-- service-role 専用（part_verify_otp と同じ規約）。
REVOKE ALL ON FUNCTION public.consume_photo_capture_nonce(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_photo_capture_nonce(text, uuid, uuid, text) TO service_role;
