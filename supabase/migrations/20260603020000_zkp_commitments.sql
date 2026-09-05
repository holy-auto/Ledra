-- 【後から内容だけ修正】このファイルは本番へ適用済み（版番号は変えていない）。
-- RLS ポリシーが `tenant_memberships.is_active` を参照していたが、**この列は本番にも無い**。
-- そのままだと CREATE POLICY 時に落ち、空 DB へ1パスで流せない。
-- 述語を落として本番の実体に合わせた（根拠: `20260719000000_fix_rls_membership_references.sql`
-- の [B]。本番の pg_policies 実査で is_active 述語なしと確認されている）。
-- 版番号を変えていないので本番では再適用されない＝本番への影響は無い。
-- ZKP コミットメントテーブル
-- 部品装着の Merkle ツリールートを保存し、保険会社向けの選択的開示を可能にする

create table if not exists public.zkp_commitments (
  id                   uuid primary key default gen_random_uuid(),
  schema_version       text not null default 'ledra-zkp-v1',
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  installation_id      uuid not null references public.part_installations(id) on delete cascade,

  -- Merkle ツリー
  merkle_root          text not null,
  leaf_count           int not null check (leaf_count > 0),
  -- クレームスナップショット（JSON）
  -- 非開示フィールドは value = null として保存
  claims_snapshot      jsonb not null default '[]',

  -- Polygon アンカー情報
  polygon_tx_hash      text,
  polygon_network      text check (polygon_network in ('polygon', 'amoy')),
  polygon_anchored_at  timestamptz,

  created_at           timestamptz not null default now()
);

-- インデックス
create index if not exists zkp_commitments_tenant_id_idx
  on public.zkp_commitments (tenant_id);

create index if not exists zkp_commitments_installation_id_idx
  on public.zkp_commitments (installation_id);

create index if not exists zkp_commitments_merkle_root_idx
  on public.zkp_commitments (merkle_root);

-- RLS
alter table public.zkp_commitments enable row level security;

-- テナントメンバーは自テナントのコミットメントを読み書きできる
create policy "tenant members can read zkp commitments"
  on public.zkp_commitments for select
  using (
    tenant_id in (
      select tenant_id from public.tenant_memberships
      where user_id = auth.uid()
    )
  );

-- 保険会社は権限付き共有によって読める（将来: insurer_zkp_access テーブルで制御）
-- 現在は service role のみが insurer ポータル経由でアクセス可能（RLS bypass）

comment on table public.zkp_commitments is
  'ZKP（選択的開示）コミットメント: 部品装着の Merkle ツリールートを保存。保険会社は生データを見ずにクレームを検証できる。';
