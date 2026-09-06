-- 【2026-09-04 / 09-05 / 09-06 ×2 と4回改名】元のファイル名は 20260903000000 だった。base（main）の最新と本番の適用済み最新は**別の値**で、どちらより後にする必要がある。
-- 2026-09-06 時点で base = 20260906000003（このファイル自身の旧版。#1020 マージ済み）、
-- 本番 = 20260906094735（#966 が apply_migration で本番へ直接当てた版。main には無い）。
-- 20260906100000 台はその両方より後。
-- **lint の migration-version-before-base-head は base としか比べない。**
-- 本番へ直接適用された版は見えないので、改名時は台帳も引くこと（M-045）。
-- 古いバージョンの未適用ファイルがあると
-- `supabase db push` が out-of-order で停止し、以降のマイグレーションが本番へ
-- 一切届かなくなる（.github/workflows/db-migrate.yml の不変条件2）。
-- 本番の schema_migrations に 20260903000000 が無いことを名指しで確認したうえで改名した
-- （適用済みを改名すると不変条件1に抵触する）。
-- `npm run lint:migrations` の migration-version-before-base-head が静的に見ている。
-- 外注職人のテナント連携（元請けがコードを発行 → 外注が入力して連携）
--
-- 背景:
--   外注職人が施工した記録は元請けのテナントに元請け名義で残る（20260906100000 の判断）。
--   証明書には craftsman_staff_id が刻まれている（20260617000004）ので「誰がやったか」は
--   分かるが、**本人がそれを見る手段が無かった**。
--
-- 方針（代表判断 2026-09-03）:
--   - 外注側にも Ledra を導入させる。**利用は必須**とし、アカウントを持たない職人は
--     設計対象にしない（トークン URL 方式は採らない）。
--   - 個人が外注として登録する場合は屋号での登録を必須とする（サインアップの
--     shop_name は既に必須。個人名を晒さないための運用側の要件）。
--   - 連携は**元請けが発行したコードを外注が自分の Ledra に入力**して成立させる。
--     今の customers.linked_tenant_id は元請けの一方的な指定で相手の同意が無いが、
--     こちらは同意を前提にする。
--   - 外注が見られるのは**自分が作業した記録だけ**。顧客名は Ledra 上で表示しない。
--
-- 設計:
--   - staff_members.linked_tenant_id: その職人の「本人テナント」。customers.linked_tenant_id と
--     同じ形。証明書に刻まれるのは craftsman_staff_id なので、作業の帰属をテナントへ
--     繋ぐにはこの列が要る（customers 側では繋がらない）。
--   - staff_link_invites: 発行したコード。raw は保存せず sha256(pepper 付き) のみ。
--     期限付きで、職人1人につき1本（再発行は差し替え）。
--
-- 他社に稼働先が見えないこと（前日の制約を維持）:
--   元請け A が読めるのは自テナントの staff_members だけ。A から
--   「この外注は B でも働いている」は引けない。**「この職人と連携しているテナントの
--   一覧」を返す API を作った瞬間に壊れる**ので、作らないこと。
--   逆に外注テナント側は自分の元請け一覧を持つが、それは自分のデータ。

ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS linked_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;

COMMENT ON COLUMN staff_members.linked_tenant_id IS
  '外注職人本人の Ledra テナント。連携コードの入力で成立する。ここが埋まっていると本人が自分の施工記録を自分の管理画面から見られる。';

-- 索引は CONCURRENTLY のため別ファイル (20260906100003)。

CREATE TABLE IF NOT EXISTS staff_link_invites (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_member_id       uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  -- sha256('stafflink|v1|' || code || pepper)。raw code は保存しない。
  code_hash             text NOT NULL UNIQUE,
  expires_at            timestamptz NOT NULL,
  redeemed_at           timestamptz,
  redeemed_by_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  -- 職人1人につき1本。再発行は code_hash の差し替え。
  UNIQUE (tenant_id, staff_member_id)
);

COMMENT ON TABLE staff_link_invites IS
  '外注職人へ渡す連携コード。元請けが発行し、外注が自分の Ledra で入力すると staff_members.linked_tenant_id が埋まる。';

CREATE INDEX IF NOT EXISTS idx_staff_link_invites_tenant
  ON staff_link_invites (tenant_id, created_at DESC);

ALTER TABLE staff_link_invites ENABLE ROW LEVEL SECURITY;

-- 発行・確認はロスターと同じ権限（20260617000002: members:manage 相当）。
-- 引き換えは相手テナントが tenant_id を知らないのでサービスロールで照合する。
DROP POLICY IF EXISTS staff_link_invites_select ON staff_link_invites;
CREATE POLICY staff_link_invites_select ON staff_link_invites
  FOR SELECT USING (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));

DROP POLICY IF EXISTS staff_link_invites_write ON staff_link_invites;
CREATE POLICY staff_link_invites_write ON staff_link_invites
  FOR ALL USING (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']))
  WITH CHECK (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));

-- ─── テナント整合トリガー ────────────────────────────────────────────────────
-- staff_member_id を id のみで参照するため、他テナントの職人 UUID を指せてしまう。
-- certificates_check_craftsman_tenant と同作法で縛る。
CREATE OR REPLACE FUNCTION public.staff_link_invites_check_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
begin
  if not exists (
    select 1 from public.staff_members
    where id = new.staff_member_id and tenant_id = new.tenant_id
  ) then
    raise exception 'staff % does not belong to tenant %', new.staff_member_id, new.tenant_id;
  end if;
  return new;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.staff_link_invites_check_tenant() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.staff_link_invites_check_tenant() TO service_role;

DROP TRIGGER IF EXISTS trg_staff_link_invites_check_tenant ON staff_link_invites;
CREATE TRIGGER trg_staff_link_invites_check_tenant
  BEFORE INSERT OR UPDATE OF staff_member_id, tenant_id ON staff_link_invites
  FOR EACH ROW EXECUTE FUNCTION public.staff_link_invites_check_tenant();

-- ─── 自テナントへの連携を禁じる ──────────────────────────────────────────────
-- 自分のテナントの職人に自分のテナントを連携させても意味が無く、
-- 「外注の実績画面」が自テナントの記録を二重に見せる形になる。
CREATE OR REPLACE FUNCTION public.staff_members_check_linked_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
begin
  if new.linked_tenant_id is not null and new.linked_tenant_id = new.tenant_id then
    raise exception 'staff % cannot link to its own tenant', new.id;
  end if;
  return new;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.staff_members_check_linked_tenant() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.staff_members_check_linked_tenant() TO service_role;

DROP TRIGGER IF EXISTS trg_staff_members_check_linked_tenant ON staff_members;
CREATE TRIGGER trg_staff_members_check_linked_tenant
  BEFORE INSERT OR UPDATE OF linked_tenant_id, tenant_id ON staff_members
  FOR EACH ROW EXECUTE FUNCTION public.staff_members_check_linked_tenant();
