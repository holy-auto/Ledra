-- ============================================================
-- 同じ Stripe PaymentIntent で支払が2件作られないようにする
--
-- 経緯: Tap to Pay は (1) PaymentIntent を確定してカードを切り、
-- (2) その後サーバへ記録しに行く。(1) が成功して (2) が失敗すると、
-- **カードは切られているのに売上が残らない**。操作者は再実行し、
-- 新しい PaymentIntent が作られて二重に請求される。
--
-- `payments.stripe_payment_intent_id` は既にあるが、Terminal 経由の記録が
-- この列を埋めていなかったため、後から突き合わせて重複を見つけることも
-- できなかった。列を埋めるようにしたうえで、DB 側でも一意にする。
--
-- 部分インデックスにするのは、現金・QR など PaymentIntent を持たない支払が
-- NULL で多数あるため（NULL 同士は一意制約に引っかからないが、明示しておく）。
-- ============================================================

create unique index concurrently if not exists payments_stripe_payment_intent_id_key
  on public.payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
