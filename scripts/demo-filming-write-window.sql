-- 撮影用の書き込み窓（デモテナント・ヒーロー車両だけ）
--
-- 紹介動画の「写真・音声から記録を作成して発行」を撮るため、デモテナントの
-- 読み取り専用ポリシー（20260514000001_demo_tenant_readonly.sql）に、
-- ヒーロー車両（scripts/setup-demo-tenant.ts の vehicle 11）への証明書 INSERT だけ例外を空ける。
-- デモのログイン情報は公開済みなので、開けている間は誰でもこの車両に証明書を作れる。撮影が終わったら必ず CLOSE を流す。
-- 発行の後段（写真アップロード・有効化）は service role で書くので、INSERT だけ開ければ足りる。
-- vehicles / customers は開けない（既存のヒーロー車両を選べば新規作成は走らない）。
--
-- 撮影で作った証明書の後片付けは `npx tsx scripts/setup-demo-tenant.ts --filming-cleanup`。

-- ── OPEN（2026-10-08 本番に適用済み）────────────────────
ALTER POLICY demo_tenant_readonly_insert ON certificates
  WITH CHECK (
    tenant_id <> '00000000-0000-0000-0000-de0000000010'::uuid
    OR vehicle_id = '00000000-0000-0000-0000-000100000011'::uuid
  );

-- ── CLOSE（元の定義に戻す）──────────────────────────────
-- ALTER POLICY demo_tenant_readonly_insert ON certificates
--   WITH CHECK (tenant_id <> '00000000-0000-0000-0000-de0000000010'::uuid);
