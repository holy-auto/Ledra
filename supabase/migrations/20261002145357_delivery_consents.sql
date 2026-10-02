-- G3/G4: 記録簿の写しの「電子交付」への事前承諾と、その撤回を顧客単位で記録する。
--
-- 背景（docs/e-maintenance-record-compliance.md 第２ ４（３）（４））:
--   記録簿の写しを電磁的方法で交付する場合、(3) 事前に交付方法を示して承諾を得る、
--   (4) 承諾が得られない/撤回された場合は電磁的交付をしてはならない。既存の署名基盤
--   （signature_sessions / delivery_receipts）は「作業内容・受領」への同意で、
--   「電子交付そのものへの事前承諾・その撤回」を顧客単位で持つ器が無かった。
--
-- 設計（追加のみ・非破壊。見積/請求の送付 documents/share は対象外）:
--   - 顧客（customers）1件につき現在の承諾状態を1行持つ（granted / revoked）。
--   - 交付方法の開示文言はアプリ層カタログ（src/lib/delivery/deliveryConsent.ts）。consent_text_hash に固定。
--   - 撤回は店舗（revoked_via='admin'）と使用者本人（顧客ポータル, revoked_via='customer'）の両方から。
--   - enforcement: 規制対象記録の電子交付（証明書の受領サイン依頼＝顧客へPDFをメール送付）で、
--     当該顧客が revoked のとき交付をブロックする（アプリ側。値の統制はアプリ層）。
create table if not exists delivery_consents (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  customer_id       uuid not null references customers(id) on delete cascade,
  -- 現在の承諾状態。granted=電子交付の事前承諾あり / revoked=撤回済（電子交付不可）。
  status            text not null default 'granted' check (status in ('granted', 'revoked')),
  -- 承諾取得時に開示した交付方法の説明（email/line/sms/ダウンロード等）。
  method            text,
  consent_version   text,
  consent_text_hash text,
  granted_at        timestamptz,
  granted_by        uuid references auth.users(id),
  revoked_at        timestamptz,
  -- 使用者本人の撤回は revoked_by=null・revoked_via='customer'。店舗代行は revoked_by=操作者。
  revoked_by        uuid references auth.users(id),
  revoked_via       text check (revoked_via in ('admin', 'customer')),
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, customer_id)
);

-- tenant_id 単独の索引は張らない（unique(tenant_id, customer_id) の索引が先頭列 tenant_id を兼ねる）。

alter table delivery_consents enable row level security;

-- 直叩き対策の RLS（API は service role の tenant scoped admin で書くため RLS をバイパスするが、
-- 直接の Supabase クライアントからの参照・改ざんを防ぐ）。参照はテナントの管理ロール、
-- 書込みも同（使用者ポータルからの撤回は service role 経由で API がテナント境界を検証する）。
drop policy if exists "delivery_consents_select" on delivery_consents;
create policy "delivery_consents_select" on delivery_consents
  for select using (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));
drop policy if exists "delivery_consents_write" on delivery_consents;
create policy "delivery_consents_write" on delivery_consents
  for all using (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']))
  with check (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));

drop trigger if exists trg_delivery_consents_updated_at on delivery_consents;
create trigger trg_delivery_consents_updated_at
  before update on delivery_consents
  for each row execute function set_updated_at();

comment on table delivery_consents is
  '記録簿の写しの電子交付への事前承諾（granted）とその撤回（revoked）を顧客単位で記録（G3/G4）。定義源: src/lib/delivery/deliveryConsent.ts。';
