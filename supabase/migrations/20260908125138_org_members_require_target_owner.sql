-- ============================================================
-- A-C1 是正: 組織への店舗追加は「追加対象テナントの owner」のみに限定
--
-- 監査 2026-09-08 (Critical): organization_members への INSERT は
-- 「呼び出し元が組織オーナーか」しか検証しておらず、追加対象テナント
-- (tenant_id) 側の所属・承諾は一切検査していなかった。API ルート側は
-- createPlatformScopedAdmin (RLS バイパス) で書き込むため、この
-- RLS policy 自体が実行時の防壁になっているわけではないが、
-- 直接 authenticated クライアントから同テーブルを操作する経路
-- (将来の実装・PostgREST 直叩き) に対する多層防御として同じ条件を
-- 反映しておく。実効な防御は API ルート側 (members/route.ts POST) の
-- tenant_memberships(role='owner') 検証。
-- ============================================================

drop policy if exists "owner can add organization members" on organization_members;
create policy "owner can add organization members"
  on organization_members for insert
  with check (
    organization_id in (select id from organizations where owner_id = auth.uid())
    and tenant_id in (
      select tenant_id from tenant_memberships
      where user_id = auth.uid() and role = 'owner'
    )
  );
