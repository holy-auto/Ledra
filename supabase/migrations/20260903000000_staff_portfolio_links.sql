-- 職人の施工実績リンク（読み取り専用・テナント発行・失効可）
--
-- 背景:
--   外注職人 (staff_members.kind='external') はログインアカウントを持たない設計
--   （20260617000002: 社内は auth.users に紐付け、外注は user_id = null）。Web 管理画面も
--   モバイルアプリも tenant_memberships が前提なので、**施工した本人が自分の記録を
--   確認する手段が Ledra 上にひとつも無かった**。本人が見られるのは、公開証明書の URL を
--   自分で控えていた場合だけで、一覧する術が無い。
--
--   証明書には発行時スナップショットとして craftsman_staff_id / craftsman_name が
--   刻まれている（20260617000004）。材料は既にあるので、あとは本人へ渡す導線だけ。
--
-- 設計:
--   テナントが職人ごとに読み取り専用リンクを1本発行する。雛形は customer_intake_links
--   （テナント発行・再利用可・無効化可能なトークンリンク、20260613000000）。
--
--   - token は raw で保存しない。sha256('staffportfolio|v1|' || token || pepper) のみ。
--     pepper は CUSTOMER_AUTH_PEPPER を接頭辞でドメイン分離して流用する（新しい必須の
--     環境変数を増やさない。未設定だと既存の顧客ポータルも動かないので運用上も同条件）。
--   - customer_intake_links と違い **raw token を暗号化して持たない**。発行時に一度だけ
--     表示し、紛失したら失効させて再発行する。QR を貼り出す用途ではなく個人に渡すリンクなので、
--     復号可能な控えを持つ利点より、持たない安全side を取る。
--   - 職人1人につき1本（unique）。再発行は同じ行の token_hash を差し替える。
--
-- 失効（「離職したらどう止めるか」への答え）:
--   有効条件は **token 一致 AND link.is_active AND staff_members.is_active** の3つ。
--   ロスターで職人を「休止中」にすると（既存の /admin/staff の在籍トグル）リンクは
--   自動的に死ぬ。離職時に別作業を覚える必要がない形にしてある。
--
-- 開示範囲:
--   このページは顧客 PII を出さない。職人が施工時に顧客を知っていたとしても、
--   リンクは退職後も手元に残りうるため、恒久的な顧客名簿にしない。詳細は既に PII を
--   落としてある公開ページ /c/[public_id] へ送る（src/lib/staff/portfolioLink.ts）。

CREATE TABLE IF NOT EXISTS staff_portfolio_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_member_id   uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  -- sha256('staffportfolio|v1|' || token || pepper)。raw token は保存しない。
  token_hash        text NOT NULL UNIQUE,
  is_active         boolean NOT NULL DEFAULT true,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_viewed_at    timestamptz,
  -- 職人1人につき1本。再発行は token_hash の差し替えで行う。
  UNIQUE (tenant_id, staff_member_id)
);

COMMENT ON TABLE staff_portfolio_links IS
  '職人が自分の施工実績を確認するための読み取り専用リンク。テナントが発行し、link.is_active と staff_members.is_active の両方で失効する。';

CREATE INDEX IF NOT EXISTS idx_staff_portfolio_links_tenant
  ON staff_portfolio_links (tenant_id, created_at DESC);

ALTER TABLE staff_portfolio_links ENABLE ROW LEVEL SECURITY;

-- 参照・発行・失効は staff_members のロスターと同じ権限に揃える
-- （20260617000002: 連絡先を含むロスターは members:manage 相当に限定）。
-- 公開ページ側は anon では読まず、サービスロールで token_hash 照合する。
DROP POLICY IF EXISTS staff_portfolio_links_select ON staff_portfolio_links;
CREATE POLICY staff_portfolio_links_select ON staff_portfolio_links
  FOR SELECT USING (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));

DROP POLICY IF EXISTS staff_portfolio_links_write ON staff_portfolio_links;
CREATE POLICY staff_portfolio_links_write ON staff_portfolio_links
  FOR ALL USING (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']))
  WITH CHECK (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));

-- ─── テナント整合トリガー ────────────────────────────────────────────────────
-- staff_member_id を id のみで参照するため、他テナントの職人 UUID を指せてしまう。
-- certificates_check_craftsman_tenant と同作法で BEFORE トリガーで縛る。
CREATE OR REPLACE FUNCTION public.staff_portfolio_links_check_tenant()
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

-- トリガー関数は呼び出しロールの EXECUTE を必要としない（20260616000004 と同方針）。
REVOKE EXECUTE ON FUNCTION public.staff_portfolio_links_check_tenant() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.staff_portfolio_links_check_tenant() TO service_role;

DROP TRIGGER IF EXISTS trg_staff_portfolio_links_check_tenant ON staff_portfolio_links;
CREATE TRIGGER trg_staff_portfolio_links_check_tenant
  BEFORE INSERT OR UPDATE OF staff_member_id, tenant_id ON staff_portfolio_links
  FOR EACH ROW EXECUTE FUNCTION public.staff_portfolio_links_check_tenant();
