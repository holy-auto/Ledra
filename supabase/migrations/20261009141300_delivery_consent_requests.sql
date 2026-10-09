-- G3: 電子交付の事前承諾を、お客様ご自身の端末で取るための「承諾のお願い」リンク。
--
-- 背景: これまで承諾の記録は (1) 店舗が管理画面で「承諾を記録」する（書面・口頭で得た承諾の記録）、
--   (2) 顧客ポータルにログインしたお客様本人が承諾する、の2経路だけだった。(2) は証明書のある顧客しか
--   ポータルに入れず、(1) はお客様の操作の証跡が残らない。店舗がリンク（メール・LINE・店頭の QR）を渡し、
--   お客様が自分の端末で文言を読んで承諾する経路を足す。
--
-- 設計（追加のみ・非破壊）:
--   - 1回の「お願い」につき1行。トークンは平文で持たず sha256（token_hash）だけ。
--   - 承諾そのものは従来どおり delivery_consents（顧客単位の現在状態）に granted_by=null で記録し、
--     経路（via=link）・依頼 ID・IP/UA は audit_logs に残す（src/lib/delivery/deliveryConsent.ts）。
--   - used_at が入ったリンクは再利用しない。expires_at を過ぎたリンクも使えない。
create table if not exists delivery_consent_requests (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  token_hash  text not null unique,
  -- どう渡したか（link=URL/QR を店舗が手渡し, email, line）。状態軸ではなく送付経路の記録。
  sent_via    text not null default 'link' check (sent_via in ('link', 'email', 'line')),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index if not exists delivery_consent_requests_customer_idx
  on delivery_consent_requests (tenant_id, customer_id, created_at desc);

alter table delivery_consent_requests enable row level security;

-- API は service role で読み書きする（公開ページはトークンのハッシュで引く）。直接のクライアントからは
-- テナントの管理ロールの参照だけ許す（delivery_consents と同じ線引き）。
drop policy if exists "delivery_consent_requests_select" on delivery_consent_requests;
create policy "delivery_consent_requests_select" on delivery_consent_requests
  for select using (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));

comment on table delivery_consent_requests is
  '電子交付の事前承諾をお客様の端末で取るための依頼リンク（G3）。承諾の現在状態は delivery_consents。';
