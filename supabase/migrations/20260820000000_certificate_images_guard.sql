-- =============================================================================
-- 証明書写真 証跡凍結ガード (IMP-023 §7 / ADR-0003)
--
-- 設計原則 10「原本証跡は不変/追記のみ（黙示上書き禁止）」。
-- 部品側 (part_installations_guard) と同パターンで、発行済み or 取消済みの
-- 証明書に紐づく写真行の削除・証跡列の破壊的変更を DB レベルで防ぐ。
--
-- 保護対象: certificates.status が 'active'(発行済み) または 'void'(取消済み) の
-- 証明書に紐づく certificate_images 行。
--
-- ルール:
--   DELETE: active/void の親を持つ行は削除不可。
--   UPDATE: active/void の親を持つ行の証跡列
--           (sha256, original_sha256, perceptual_hash, stage, authenticity_grade,
--            tsa_token, tsa_authority, tsa_timestamp_at, c2pa_manifest_cid,
--            storage_path) の変更を拒否。他列 (sort_order 等) は許可。
--   INSERT: 制限なし（追記は許可）。
--
-- draft/expired の証明書は作業中のため DELETE/UPDATE を許容する。
-- =============================================================================

CREATE OR REPLACE FUNCTION public.certificate_images_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cert_status text;
BEGIN
  -- 親証明書のステータスを取得
  SELECT status INTO v_cert_status
  FROM public.certificates
  WHERE id = OLD.certificate_id;

  -- 親が active/void でなければ制限なし
  IF v_cert_status IS NULL OR v_cert_status NOT IN ('active', 'void') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- DELETE: active/void の親を持つ行は削除不可
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'certificate_images: 発行済み/取消済み証明書の写真は削除できません (id=%, cert_status=%)',
      OLD.id, v_cert_status;
  END IF;

  -- UPDATE: 証跡列の変更を拒否
  IF NEW.sha256              IS DISTINCT FROM OLD.sha256
  OR NEW.original_sha256     IS DISTINCT FROM OLD.original_sha256
  OR NEW.perceptual_hash     IS DISTINCT FROM OLD.perceptual_hash
  OR NEW.stage               IS DISTINCT FROM OLD.stage
  OR NEW.authenticity_grade  IS DISTINCT FROM OLD.authenticity_grade
  OR NEW.tsa_token           IS DISTINCT FROM OLD.tsa_token
  OR NEW.tsa_authority       IS DISTINCT FROM OLD.tsa_authority
  OR NEW.tsa_timestamp_at    IS DISTINCT FROM OLD.tsa_timestamp_at
  OR NEW.c2pa_manifest_cid   IS DISTINCT FROM OLD.c2pa_manifest_cid
  OR NEW.storage_path        IS DISTINCT FROM OLD.storage_path
  THEN
    RAISE EXCEPTION
      'certificate_images: 発行済み/取消済み証明書の証跡列は変更できません (id=%, cert_status=%)',
      OLD.id, v_cert_status;
  END IF;

  -- 非証跡列 (sort_order, file_name 等) の変更は許可
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_certificate_images_guard ON certificate_images;
CREATE TRIGGER trg_certificate_images_guard
  BEFORE UPDATE OR DELETE ON certificate_images
  FOR EACH ROW EXECUTE FUNCTION public.certificate_images_guard();
