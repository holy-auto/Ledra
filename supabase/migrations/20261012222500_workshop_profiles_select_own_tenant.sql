-- 施工店の設備・資格（workshop_capability_profiles）の参照を、自分の施工店の行だけに絞る。
--
-- 以前は 20260919150000_workshop_capability_profiles_catchup.sql の
-- 「施工店の業務能力は秘匿情報ではないため、認証済みユーザーは参照可能」（USING (true)）で、
-- ログインした人なら誰でも PostgREST から全施工店の許可番号・整備士の資格者名・対応地域を読めた。
-- 1施工店1行でメーカーをまたいで共有される情報なので、代表判断（2026-10-12）で閉じる。
--
-- 読む経路:
--   - 施工店（Web /admin・モバイル）: 自分の tenant_id を利用者のクライアントで読む → my_tenant_ids() で通る
--   - メーカー: サーバー側の service role で読み、API で自社の実証テストの参加施工店に絞る（isParticipatingTenant）
--     → RLS を通らないので影響しない
-- 書き込みのポリシー（tenant_insert / tenant_update）は元から自分の施工店だけで、変えない。

DROP POLICY IF EXISTS "workshop_cap_profiles_auth_select" ON workshop_capability_profiles;
DROP POLICY IF EXISTS "workshop_cap_profiles_tenant_select" ON workshop_capability_profiles;
CREATE POLICY "workshop_cap_profiles_tenant_select" ON workshop_capability_profiles
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT my_tenant_ids()));
