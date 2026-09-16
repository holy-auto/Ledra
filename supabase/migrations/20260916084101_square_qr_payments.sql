-- ============================================================
-- Square 経由の店頭 QR コード決済（PayPay / d払い / 楽天ペイ / au PAY /
-- メルペイ / WeChat Pay / Alipay+）を Ledra から起こせるようにする。
--
-- なぜ Square か: これらは Stripe が対応しておらず、Ledra から決済できない。
-- Square は日本で主要7種の QR 決済に対応し、**申請1回で全ブランド**が使える。
--
-- 2つの列を足す:
--   1) square_connections.square_terminal_device_id
--      Terminal API でマルチブランド QR を出す端末。ペアリング時に保存する。
--   2) payments.square_payment_id
--      **同じ Square 決済で売上を2件立てない**ための冪等キー。
--      Stripe 側（payments_stripe_payment_intent_id_key）と同じ形にする ——
--      決済は記録より先に完了しているので、記録の失敗をやり直したときに
--      二重計上させないための最後の砦が DB 側にも要る。
--
-- 一意インデックスは CONCURRENTLY で別ファイル（直後のタイムスタンプ）に
-- 分けてある。CONCURRENTLY はトランザクション内で実行できず、Supabase は
-- マイグレーションを複数文まとめてパイプラインで送るため、同じファイルに
-- 他の文と同居すると2文目以降が SQLSTATE 25001 で落ちる。
-- ============================================================

alter table public.square_connections
  add column if not exists square_terminal_device_id text;

alter table public.payments
  add column if not exists square_payment_id text;
