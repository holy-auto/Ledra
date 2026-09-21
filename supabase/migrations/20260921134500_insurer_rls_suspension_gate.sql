-- 保険会社の停止を RLS 側にも効かせる。
--
-- 2026-09-20 に RPC 側（顧客データを返す5本）は public.current_insurer_access() で塞いだが、
-- **RLS は素通りのままだった。** PostgREST は表も直接公開しているので、
-- 停止中（suspended）の保険会社ユーザが insurer_cases / insurer_case_messages /
-- insurer_case_attachments / pii_disclosure_consents を読めていた。
--
-- 判定は my_insurer_ids() 1本にある（14本のポリシーが全部これを呼ぶ。他に呼び出し元は無い
-- ことを本番の pg_proc で実測）。なのでポリシーは1本も触らず、この関数だけを直す。
--
-- ── なぜ①が先に要るのか（ここが今回の肝）────────────────────────────────
-- ② のゲートだけ入れると、**マイグレーションから作った DB では自社の行まで見えなくなる**。
-- 本番は insurers / insurer_users に my_insurer_ids() を使わない SELECT ポリシーを
-- 3本持っていて、それが「停止中でも自社の1行は読める」を支えている。
-- ところがその3本は**マイグレーションのどこにも書かれていない**（本番だけのドリフト）。
-- 再生 DB で実測すると、3本が無い状態で②を入れた場合は insurers が 0 行になる。
-- つまり本番だけ無事で、プレビュー分岐と新環境が壊れる。先に書き起こす。

-- ① 本番にだけ在る3本を書き起こす（本番と同じ定義。本番では CREATE が no-op になるよう
--    先に DROP IF EXISTS する）
DROP POLICY IF EXISTS insurers_select_own ON public.insurers;
CREATE POLICY insurers_select_own ON public.insurers
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.insurer_users iu
                 WHERE iu.insurer_id = public.insurers.id
                   AND iu.user_id = auth.uid()
                   AND iu.is_active = true));

DROP POLICY IF EXISTS insurers_select_linked_user ON public.insurers;
CREATE POLICY insurers_select_linked_user ON public.insurers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.insurer_users iu
                 WHERE iu.insurer_id = public.insurers.id
                   AND iu.user_id = auth.uid()
                   AND COALESCE(iu.is_active, true) = true));

DROP POLICY IF EXISTS insurer_users_select_self ON public.insurer_users;
CREATE POLICY insurer_users_select_self ON public.insurer_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND COALESCE(is_active, true) = true);

-- ② 停止判定を足す。規則は resolveInsurerCaller / current_insurer_access() と同じ
--    （iu.is_active + i.is_active + i.status IN ('active','active_pending_review')）。
--
--    current_insurer_access() は使わない。あちらは LIMIT 1 で**1件だけ**選ぶ設計で、
--    RLS は「所属している保険会社**すべて**」を要る（複数所属のユーザが出た瞬間に
--    片方の自社データが消える）。同じ条件を集合として返すのがここの役目。
--
--    search_path は '' にする（従来は 'public','extensions','pg_temp' で
--    lint-migrations の security-definer-mutable-search-path に引っかかる形だった）。
CREATE OR REPLACE FUNCTION public.my_insurer_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT iu.insurer_id
  FROM public.insurer_users iu
  JOIN public.insurers i ON i.id = iu.insurer_id
  WHERE iu.user_id = auth.uid()
    AND iu.is_active = true
    AND i.is_active = true
    AND i.status IN ('active', 'active_pending_review')
$$;
