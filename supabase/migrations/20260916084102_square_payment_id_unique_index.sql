-- ============================================================
-- payments.square_payment_id の一意インデックス（CONCURRENTLY のため単独ファイル）。
--
-- `20260907044719_square_qr_payments.sql` で足した列に対する一意制約。
-- 部分インデックス: 現金・カードなど Square を経由しない支払は NULL のため。
-- ============================================================

create unique index concurrently if not exists payments_square_payment_id_key
  on public.payments (square_payment_id)
  where square_payment_id is not null;
