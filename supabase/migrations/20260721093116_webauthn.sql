-- WebAuthn 操作署名 — 認証器の登録・チャレンジ・操作アサーション
--
-- 重要操作(施工完了/証明書確定/取消/署名/訂正 等)を「登録済み認証器の本人」に暗号的に束縛する
-- ための土台。Phase 1(本マイグレーション + 登録セレモニー)ではテーブルと登録を用意し、
-- 操作署名(チャレンジ = 業務イベントの payload_hash に束縛)は後続で配線する。
--
-- 不変性 vs 削除権: assertions は消去権(crypto-shredding)の ON DELETE CASCADE を通すため
-- DELETE は許可、UPDATE のみトリガで拒否(certificate_versions と同じ方針)。

-- ─────────────────────────────────────────────────────────────────────────────
-- operator_credentials: ユーザーごとの登録済み認証器(パスキー/セキュリティキー)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists operator_credentials (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,          -- base64url
  public_key    text not null,                 -- COSE 公開鍵(base64url)
  counter       bigint not null default 0,     -- 署名カウンタ(リプレイ検知)
  transports    text[],
  aaguid        text,                          -- 認証器種別(不明時 null)
  device_type   text,                          -- 'singleDevice' | 'multiDevice'
  backed_up     boolean not null default false,-- 同期パスキー(共有可能)識別用
  device_label  text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists operator_credentials_user_idx
  on operator_credentials (user_id) where is_active;
create index if not exists operator_credentials_tenant_idx
  on operator_credentials (tenant_id);

alter table operator_credentials enable row level security;
-- 本人のみ参照/失効可。書込はサービスロール(tenant-scoped admin)経由。
create policy "operator_credentials_owner_select"
  on operator_credentials for select using (user_id = auth.uid());
create policy "operator_credentials_owner_update"
  on operator_credentials for update using (user_id = auth.uid());
create policy "operator_credentials_service_insert"
  on operator_credentials for insert with check (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- webauthn_challenges: サーバー発行の一度限りチャレンジ(登録/認証・TTL 付き)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists webauthn_challenges (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  purpose            text not null check (purpose in ('registration', 'authentication')),
  challenge          text not null,            -- base64url
  -- 操作署名用の束縛(registration 時は null)
  operation_type     text,                     -- 'finalize' | 'void' | 'correction' | 'signature' ...
  certificate_id     uuid references certificates(id) on delete cascade,
  bound_payload_hash text,                     -- そのイベントの payload_hash(64hex)
  expires_at         timestamptz not null,
  consumed_at        timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists webauthn_challenges_user_purpose_idx
  on webauthn_challenges (user_id, purpose, created_at desc)
  where consumed_at is null;

alter table webauthn_challenges enable row level security;
-- クライアントは直接触らない(全て service-role 経由)。参照は本人のみ許可(デバッグ/監査用)。
create policy "webauthn_challenges_owner_select"
  on webauthn_challenges for select using (user_id = auth.uid());
create policy "webauthn_challenges_service_write"
  on webauthn_challenges for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- webauthn_assertions: 操作署名の不変記録(UPDATE 禁止・DELETE は消去権 CASCADE 用に許可)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists webauthn_assertions (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  credential_id      text not null,
  certificate_id     uuid references certificates(id) on delete cascade,
  operation_type     text not null,
  challenge_id       uuid references webauthn_challenges(id) on delete set null,
  bound_payload_hash text not null,            -- 署名がコミットしたイベント payload_hash
  authenticator_data text,                     -- base64url
  client_data_json   text,                     -- base64url
  signature          text,                     -- base64url
  user_verified      boolean not null,
  new_counter        bigint,
  created_at         timestamptz not null default now(),
  verified_at        timestamptz not null default now()
);

create index if not exists webauthn_assertions_cert_idx
  on webauthn_assertions (certificate_id) where certificate_id is not null;
create index if not exists webauthn_assertions_tenant_idx
  on webauthn_assertions (tenant_id);

create or replace function public.webauthn_assertions_no_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'webauthn_assertions: アサーションは不変です。更新できません (id=%)', OLD.id;
end;
$$;

drop trigger if exists trg_webauthn_assertions_no_update on webauthn_assertions;
create trigger trg_webauthn_assertions_no_update
  before update on webauthn_assertions
  for each row execute function public.webauthn_assertions_no_update();

alter table webauthn_assertions enable row level security;
create policy "webauthn_assertions_tenant_select"
  on webauthn_assertions for select
  using (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));
create policy "webauthn_assertions_service_insert"
  on webauthn_assertions for insert with check (auth.role() = 'service_role');
