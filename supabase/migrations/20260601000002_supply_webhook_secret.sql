-- 供給パートナーの受注確定 Webhook 用の署名シークレット列を追加する。
--
-- パートナーの受注システムが「注文を受け付けた/出荷した」等を非同期で通知する
-- Webhook (POST /api/webhooks/supply/<partnerId>) の HMAC 署名検証に使う共有秘密。
-- secretBox (AES-256-GCM) で暗号化して保存し、平文では保持しない。
--
-- 冪等・additive: 列追加のみ。
-- 【後から内容だけ修正】supply_partner_credentials を作るのは 20260601000006（このファイルより後ろ）。
-- 空 DB へ1パスで流すとここで落ちる。無いときは飛ばし、
-- 空 DB 側の列は 20260601000006_supply_partners.sql の末尾で足す。
DO $mig$
BEGIN
  IF to_regclass('public.supply_partner_credentials') IS NOT NULL THEN
    ALTER TABLE public.supply_partner_credentials
      ADD COLUMN IF NOT EXISTS webhook_secret_ciphertext text;

    COMMENT ON COLUMN public.supply_partner_credentials.webhook_secret_ciphertext IS
      '受注確定 Webhook の HMAC 署名検証用シークレット (secretBox 暗号化)。パートナーが生成・保持し、署名に使う。';
  END IF;
END
$mig$;
