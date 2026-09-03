-- 空 DB 用の補い: 20260601000002 / 20260601000003 が足すはずだった列を、
-- supply_partners / supply_partner_credentials が出来たこの位置で足す。
-- どちらも ADD COLUMN IF NOT EXISTS なので、本番では no-op。
-- 飛ばした側と同じく to_regclass で見てから触る（テーブルの有無を前提にしない）。
DO $mig$
BEGIN
  IF to_regclass('public.supply_partner_credentials') IS NOT NULL THEN
    ALTER TABLE public.supply_partner_credentials
      ADD COLUMN IF NOT EXISTS webhook_secret_ciphertext text;

    COMMENT ON COLUMN public.supply_partner_credentials.webhook_secret_ciphertext IS
      '受注確定 Webhook の HMAC 署名検証用シークレット (secretBox 暗号化)。パートナーが生成・保持し、署名に使う。';
  END IF;

  IF to_regclass('public.supply_partners') IS NOT NULL THEN
    ALTER TABLE public.supply_partners
      ADD COLUMN IF NOT EXISTS is_trusted boolean NOT NULL DEFAULT false;

    COMMENT ON COLUMN public.supply_partners.is_trusted IS
      '運営が承認した信頼パートナー。全自動送信(auto-send)の対象になり得る。既定 false。';
  END IF;
END
$mig$;
