-- 顧客の問い合わせ（customer_inquiries）の、誰でも挿入できるポリシー public_insert（WITH CHECK (true)）を外す。
--
-- 20260409000000_customer_inquiries.sql が作っており、anon キーで任意のテナント宛ての問い合わせを
-- 好きな customer_id・status・admin_reply 付きで入れられる。本番には無い（2026-10-17 の API 点検で確認）が、
-- マイグレーションに残っているので、空の DB から作る環境（Supabase のプレビュー DB など）では復活する。
--
-- アプリの挿入は service role だけ（src/app/api/customer/inquiry/route.ts の createTenantScopedAdmin）。
-- 一覧・返信（/api/admin/customer-inquiries）も service role で、利用者のクライアントからは書かない。外しても影響しない。

DROP POLICY IF EXISTS "public_insert" ON customer_inquiries;
