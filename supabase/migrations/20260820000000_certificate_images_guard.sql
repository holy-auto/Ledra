-- =============================================================================
-- 証明書写真 証跡凍結ガード (IMP-023 §7 / ADR-0003)
--
-- 設計原則 10「原本証跡は不変/追記のみ（黙示上書き禁止）」。
-- 部品側 (part_installations_guard) と同パターンで、発行済み・取消済み・
-- 期限切れの証明書に紐づく写真行の削除・証跡列の破壊的変更を DB レベルで防ぐ。
--
-- 保護対象: certificates.status が 'draft'(作業中) 以外——すなわち
-- 'active'(発行済み)・'void'(取消済み)・'expired'(期限切れ)——の証明書に
-- 紐づく certificate_images 行。
--
-- 'expired' も保護対象に含める理由: expired は「一度 active だった証明書が
-- 保証期間満了で自動遷移した」状態であり(`src/app/api/cron/maintenance/route.ts`
-- が毎日 active→expired を自動実行)、撮影当時の原本証跡としての価値は
-- 期限満了後も変わらない。むしろ紛争は保証期間の終わり際〜満了後に顕在化しやすく、
-- draft(作業中で撮り直しが日常的)と同列に扱うと発行済み証跡の不変性が失われる。
--
-- ルール:
--   DELETE: draft 以外の親を持つ行は削除不可。
--   UPDATE: draft 以外の親を持つ行の証跡列(下記コメント参照)の変更を拒否。
--           他列 (sort_order, file_name, annotations, rendered_* 等) は許可。
--   INSERT: 制限なし（追記は許可）。
--
-- 証跡列は `processUploadedPhoto.ts` がアップロード時に一度だけ書き込む
-- 全フィールド(改ざん検知・真正性判定の根拠になる値)+ certificate_id:
--   sha256, original_sha256, perceptual_hash, stage, storage_path,
--   authenticity_grade, tsa_token, tsa_authority, tsa_timestamp_at,
--   c2pa_manifest_cid, c2pa_manifest, c2pa_verified,
--   external_c2pa_present, external_c2pa_verified, external_c2pa_signer,
--   capture_nonce, capture_binding_reason,
--   device_attestation_provider, device_attestation_token_hash, device_attestation_verified,
--   exif_captured_at, exif_device_model, exif_gps_stripped,
--   gps_check_verdict, gps_distance_bucket,
--   deepfake_score, deepfake_verdict,
--   certificate_id (別証明書への付け替えで凍結済み証跡を実質的に切り離せる穴を防ぐ)。
-- polygon_tx_hash/polygon_network は意図的に対象外 — アンカリングは active な
-- 証明書に対しても事後実行される正規の追記操作であり(`qstash/polygon-backfill`)、
-- 証跡そのものの改変ではない。
--
-- 既知の限界（この移行では対応しない。IMP-030 以降で要検討）:
--   (a) この関数は親 certificates.status を都度 SELECT で読むだけで、行ロックを
--       取らない。証明書の activate と同一写真行への DELETE が真に同時に走ると、
--       ガードが古い draft を読んで削除を許してしまう競合の余地が理論上ある。
--   (b) certificates.status 自体は本ガードの対象外(別テーブル)なので、
--       active→draft のような逆方向遷移をアプリ層のバリデーションを経ずに
--       直接 UPDATE されると、そこから先の write が全て凍結解除されてしまう。
--   (c) 親 certificates 行自体が削除される(ON DELETE CASCADE)と、子の
--       certificate_images 側からは「親が見つからない」==「制限なし」に
--       見えるため、削除経路そのものが凍結をすり抜ける。
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

  -- 親が draft (または見つからない) なら制限なし
  IF v_cert_status IS NULL OR v_cert_status = 'draft' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- DELETE: draft 以外の親を持つ行は削除不可
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'certificate_images: 発行済み/取消済み/期限切れ証明書の写真は削除できません (id=%, cert_status=%)',
      OLD.id, v_cert_status;
  END IF;

  -- UPDATE: 証跡列の変更を拒否
  IF NEW.sha256                          IS DISTINCT FROM OLD.sha256
  OR NEW.original_sha256                 IS DISTINCT FROM OLD.original_sha256
  OR NEW.perceptual_hash                 IS DISTINCT FROM OLD.perceptual_hash
  OR NEW.stage                           IS DISTINCT FROM OLD.stage
  OR NEW.authenticity_grade              IS DISTINCT FROM OLD.authenticity_grade
  OR NEW.tsa_token                       IS DISTINCT FROM OLD.tsa_token
  OR NEW.tsa_authority                   IS DISTINCT FROM OLD.tsa_authority
  OR NEW.tsa_timestamp_at                IS DISTINCT FROM OLD.tsa_timestamp_at
  OR NEW.c2pa_manifest_cid               IS DISTINCT FROM OLD.c2pa_manifest_cid
  OR NEW.c2pa_manifest                   IS DISTINCT FROM OLD.c2pa_manifest
  OR NEW.c2pa_verified                   IS DISTINCT FROM OLD.c2pa_verified
  OR NEW.external_c2pa_present           IS DISTINCT FROM OLD.external_c2pa_present
  OR NEW.external_c2pa_verified          IS DISTINCT FROM OLD.external_c2pa_verified
  OR NEW.external_c2pa_signer            IS DISTINCT FROM OLD.external_c2pa_signer
  OR NEW.capture_nonce                   IS DISTINCT FROM OLD.capture_nonce
  OR NEW.capture_binding_reason          IS DISTINCT FROM OLD.capture_binding_reason
  OR NEW.device_attestation_provider     IS DISTINCT FROM OLD.device_attestation_provider
  OR NEW.device_attestation_token_hash   IS DISTINCT FROM OLD.device_attestation_token_hash
  OR NEW.device_attestation_verified     IS DISTINCT FROM OLD.device_attestation_verified
  OR NEW.exif_captured_at                IS DISTINCT FROM OLD.exif_captured_at
  OR NEW.exif_device_model               IS DISTINCT FROM OLD.exif_device_model
  OR NEW.exif_gps_stripped               IS DISTINCT FROM OLD.exif_gps_stripped
  OR NEW.gps_check_verdict               IS DISTINCT FROM OLD.gps_check_verdict
  OR NEW.gps_distance_bucket             IS DISTINCT FROM OLD.gps_distance_bucket
  OR NEW.deepfake_score                  IS DISTINCT FROM OLD.deepfake_score
  OR NEW.deepfake_verdict                IS DISTINCT FROM OLD.deepfake_verdict
  OR NEW.storage_path                    IS DISTINCT FROM OLD.storage_path
  OR NEW.certificate_id                  IS DISTINCT FROM OLD.certificate_id
  THEN
    RAISE EXCEPTION
      'certificate_images: 発行済み/取消済み/期限切れ証明書の証跡列は変更できません (id=%, cert_status=%)',
      OLD.id, v_cert_status;
  END IF;

  -- 非証跡列 (sort_order, file_name, annotations, rendered_* 等) の変更は許可
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_certificate_images_guard ON certificate_images;
CREATE TRIGGER trg_certificate_images_guard
  BEFORE UPDATE OR DELETE ON certificate_images
  FOR EACH ROW EXECUTE FUNCTION public.certificate_images_guard();
