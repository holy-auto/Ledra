-- 保険会社の停止ゲートが **RLS 側でも** 効くかを、行を入れて確かめる。
--
-- なぜ要るか: 停止判定は public.my_insurer_ids() 1本にあり、14本の RLS ポリシーが
-- そこを通る。条件を1つ落としても構文も型も通る。**壊れたことが分かるのは、
-- 停止したはずの保険会社が他社テナントの案件を読めたときだけ** なので振る舞いで見る。
--
-- もう1つ、この検査にしか守れないものがある:
-- **「停止中でも自社の1行は読める」** —— これは insurers / insurer_users にある
-- my_insurer_ids() を使わない3本のポリシーが支えている。その3本は 2026-09-21 まで
-- 本番にしか無く、マイグレーションには書かれていなかった。3本が消えると
-- 「アカウント停止中」の画面が自社名すら出せなくなるので、**件数で固定する**。
--
-- RLS は表の所有者と superuser には効かない。必ず authenticated ロールに降りてから数える。
--
-- 最後に ROLLBACK するので DB には何も残らない。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

BEGIN;

-- auth.uid() は request.jwt.claim.sub を読む（scripts/replay/bootstrap.sql）。
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000babe', true);

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-4000-8000-00000000babe'),   -- 本人
  ('00000000-0000-4000-8000-00000000cafe'),   -- 同僚
  ('00000000-0000-4000-8000-00000000dead');   -- 無関係な人

INSERT INTO public.tenants (id, name, slug)
VALUES ('00000000-0000-4000-8000-0000000001a1', 'rls-gate tenant', 'rls-gate-tenant');

INSERT INTO public.insurers (id, name, slug, is_active, status)
VALUES ('00000000-0000-4000-8000-0000000001b1', 'rls-gate insurer', 'rls-gate-insurer', true, 'active');

INSERT INTO public.insurer_users (id, insurer_id, user_id, is_active, created_at, role) VALUES
  ('00000000-0000-4000-8000-0000000001c1', '00000000-0000-4000-8000-0000000001b1',
   '00000000-0000-4000-8000-00000000babe', true, '2026-01-01T00:00:00Z', 'admin'),
  ('00000000-0000-4000-8000-0000000001c2', '00000000-0000-4000-8000-0000000001b1',
   '00000000-0000-4000-8000-00000000cafe', true, '2026-02-01T00:00:00Z', 'viewer');

INSERT INTO public.insurer_tenant_access (id, insurer_id, tenant_id, is_active)
VALUES ('00000000-0000-4000-8000-0000000001d1', '00000000-0000-4000-8000-0000000001b1',
        '00000000-0000-4000-8000-0000000001a1', true);

INSERT INTO public.insurer_cases (id, insurer_id, tenant_id, case_number, title)
VALUES ('00000000-0000-4000-8000-0000000001e1', '00000000-0000-4000-8000-0000000001b1',
        '00000000-0000-4000-8000-0000000001a1', 'RLS-GATE-1', 'rls gate case');

INSERT INTO public.insurer_case_messages (id, case_id, sender_id, sender_type, content)
VALUES ('00000000-0000-4000-8000-0000000001f1', '00000000-0000-4000-8000-0000000001e1',
        '00000000-0000-4000-8000-00000000babe', 'insurer', 'rls gate message');

-- pii_disclosure_consents と ai_usage_logs は、insurer_cases を経由せず
-- insurer_id を直接見るポリシーなので、**案件が 0 件でも独立に漏れうる**。
-- /code-review の指摘（2026-09-21）で足した。証明書は FK のために要る。
INSERT INTO public.certificates (id, tenant_id, public_id)
VALUES ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000001a1', 'rls-gate-cert');

INSERT INTO public.pii_disclosure_consents (id, certificate_id, insurer_id, is_active)
VALUES ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-0000000001b1', true);

INSERT INTO public.ai_usage_logs (id, insurer_id, endpoint, outcome)
VALUES ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-0000000001b1',
        'rls-gate-endpoint', 'ok');

INSERT INTO public.insurer_case_attachments (id, case_id, file_name, storage_path)
VALUES ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-0000000001e1',
        'rls-gate.pdf', 'rls-gate/rls-gate.pdf');

DO $$
DECLARE
  k_insurer CONSTANT uuid := '00000000-0000-4000-8000-0000000001b1';
  k_self    CONSTANT uuid := '00000000-0000-4000-8000-0000000001c1';
  n_ins int; n_iu int; n_ita int; n_case int; n_msg int; n_self int;
  n_pdc int; n_ai int; n_att int;
  missing text;
BEGIN
  -- ── 前提: 自社行を支える3本が居ること ────────────────────────────────
  -- ここが消えると下の「停止中でも insurers が1行」は別の理由で通らなくなる。
  -- 先に名前で確かめて、原因を取り違えないようにする。
  SELECT string_agg(want, ', ') INTO missing
  FROM (VALUES ('insurers', 'insurers_select_own'),
               ('insurers', 'insurers_select_linked_user'),
               ('insurer_users', 'insurer_users_select_self')) AS v(tbl, want)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = v.tbl AND p.policyname = v.want);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      '自社行を支えるポリシーが無い: %。これが無いと停止中に自社名すら出せない', missing;
  END IF;

  -- ── 陽性対照1: active では今までどおり全部見える ──────────────────────
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n_ins  FROM public.insurers;
  SELECT count(*) INTO n_iu   FROM public.insurer_users;
  SELECT count(*) INTO n_ita  FROM public.insurer_tenant_access;
  SELECT count(*) INTO n_case FROM public.insurer_cases;
  SELECT count(*) INTO n_msg  FROM public.insurer_case_messages;
  SELECT count(*) INTO n_att  FROM public.insurer_case_attachments;
  SELECT count(*) INTO n_pdc  FROM public.pii_disclosure_consents;
  SELECT count(*) INTO n_ai   FROM public.ai_usage_logs;
  EXECUTE 'RESET ROLE';
  IF (n_ins, n_iu, n_ita, n_case, n_msg) <> (1, 2, 1, 1, 1) THEN
    RAISE EXCEPTION
      'active で見え方が変わった: insurers=% insurer_users=% tenant_access=% cases=% messages=%（期待 1/2/1/1/1）。ゲートが厳しすぎる',
      n_ins, n_iu, n_ita, n_case, n_msg;
  END IF;
  IF (n_att, n_pdc, n_ai) <> (1, 1, 1) THEN
    RAISE EXCEPTION
      'active で添付・PII開示同意・AI利用ログが見えない: attachments=% consents=% ai_logs=%（期待 1/1/1）',
      n_att, n_pdc, n_ai;
  END IF;

  -- ── 陽性対照2: 審査中（active_pending_review）も通る ──────────────────
  -- ルート層 resolveInsurerCaller が許しているので、RLS だけ弾くと画面が割れる
  UPDATE public.insurers SET status = 'active_pending_review' WHERE id = k_insurer;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n_case FROM public.insurer_cases;
  EXECUTE 'RESET ROLE';
  IF n_case <> 1 THEN
    RAISE EXCEPTION 'active_pending_review で案件が見えない（% 件）', n_case;
  END IF;

  -- ── 陰性対照1: 停止中は他社テナントの顧客データを1行も返さない（本体）──
  UPDATE public.insurers SET status = 'suspended' WHERE id = k_insurer;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n_ita  FROM public.insurer_tenant_access;
  SELECT count(*) INTO n_case FROM public.insurer_cases;
  SELECT count(*) INTO n_msg  FROM public.insurer_case_messages;
  SELECT count(*) INTO n_att  FROM public.insurer_case_attachments;
  SELECT count(*) INTO n_pdc  FROM public.pii_disclosure_consents;
  SELECT count(*) INTO n_ai   FROM public.ai_usage_logs;
  EXECUTE 'RESET ROLE';
  IF (n_ita, n_case, n_msg) <> (0, 0, 0) THEN
    RAISE EXCEPTION
      '停止中なのに顧客データ経路が開いている: tenant_access=% cases=% messages=%（期待 0/0/0）',
      n_ita, n_case, n_msg;
  END IF;
  -- 添付は insurer_cases 経由なので案件が閉じれば連れて閉じるが、
  -- **PII 開示同意と AI 利用ログは insurer_id を直接見る**。案件が 0 件でも独立に漏れうるので
  -- 別の IF で数える（まとめると、どちらが開いたのかメッセージで分からない）。
  IF n_att <> 0 THEN
    RAISE EXCEPTION '停止中なのに案件の添付が見える（% 件）', n_att;
  END IF;
  IF n_pdc <> 0 THEN
    RAISE EXCEPTION
      '停止中なのに PII 開示同意が見える（% 件）。pii_disclosure_consents のポリシーがゲートを通っていない', n_pdc;
  END IF;
  IF n_ai <> 0 THEN
    RAISE EXCEPTION
      '停止中なのに AI 利用ログが見える（% 件）。ai_usage_logs のポリシーがゲートを通っていない', n_ai;
  END IF;

  -- ── 陰性対照2: ただし自社の1行と自分のメンバーシップは残る ────────────
  -- ここが 0 になると「アカウント停止中」の画面が自社名も出せず、
  -- 停止された側が問い合わせ先すら分からなくなる。**緩めではなく必須の1行。**
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n_ins FROM public.insurers;
  SELECT count(*) INTO n_iu  FROM public.insurer_users;
  SELECT count(*) INTO n_self FROM public.insurer_users WHERE id = k_self;
  EXECUTE 'RESET ROLE';
  IF n_ins <> 1 THEN
    RAISE EXCEPTION '停止中に自社の行まで消えた（% 件）。停止中の画面が描けない', n_ins;
  END IF;
  IF n_iu <> 1 OR n_self <> 1 THEN
    RAISE EXCEPTION
      '停止中の insurer_users の見え方が想定と違う: 全体=% 自分=%（期待 1/1 = 自分だけ）',
      n_iu, n_self;
  END IF;

  -- ── 陰性対照3: insurers.is_active = false も顧客データを閉じる ────────
  UPDATE public.insurers SET status = 'active', is_active = false WHERE id = k_insurer;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n_case FROM public.insurer_cases;
  EXECUTE 'RESET ROLE';
  IF n_case <> 0 THEN
    RAISE EXCEPTION 'is_active=false なのに案件が見える（% 件）', n_case;
  END IF;

  -- ── 陰性対照4: insurer_users.is_active = false は自社行ごと閉じる ──────
  -- 3本とも iu.is_active を見ているので、無効化された担当者は自社名も見えない
  -- （従来からの挙動。ここが変わると「退職者に会社が見えたまま」になる）
  UPDATE public.insurers SET is_active = true WHERE id = k_insurer;
  UPDATE public.insurer_users SET is_active = false WHERE id = k_self;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n_ins FROM public.insurers;
  SELECT count(*) INTO n_iu  FROM public.insurer_users;
  EXECUTE 'RESET ROLE';
  IF n_ins <> 0 OR n_iu <> 0 THEN
    RAISE EXCEPTION
      '無効化された担当者に見えている: insurers=% insurer_users=%（期待 0/0）', n_ins, n_iu;
  END IF;

  -- ── 陰性対照5: 別人のセッションでは何も見えない（auth.uid() を見ている確認）──
  UPDATE public.insurer_users SET is_active = true WHERE id = k_self;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000dead', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n_ins  FROM public.insurers;
  SELECT count(*) INTO n_case FROM public.insurer_cases;
  EXECUTE 'RESET ROLE';
  IF n_ins <> 0 OR n_case <> 0 THEN
    RAISE EXCEPTION
      '無関係なユーザに見えている: insurers=% cases=%（期待 0/0）。auth.uid() を見ていない',
      n_ins, n_case;
  END IF;

  RAISE NOTICE '保険会社の RLS 停止ゲート: 陽性対照2件・陰性対照5件すべて期待どおり';
END $$;

ROLLBACK;
