-- 2026-10-17 の API 点検で塞いだ4件の RLS の穴が、塞がったままであることを行を入れて確かめる。
--   1. market_vehicles / market_vehicle_images: anon と他テナントは読めない（20261017103611）
--   2. customer_inquiries: 利用者のクライアントから直接は挿入できない（20261017103612）
--   3. ft_applications / ft_agreements / ft_jobs: 施工店はアプリの正規操作の範囲しか書けない（20261017103613）
--   4. staff_members.linked_tenant_id: 利用者のクライアントからは連携先を設定・変更できない（20261017103614）
-- [攻撃] は拒否（または0行）、[正規] はアプリの正規の画面操作と同じ SQL で、通ること（陽性対照）を見る。
--
-- なぜ要るか: どれもポリシーやトリガーの1行で止めていて、消えても構文も型も通る。壊れたことが分かるのは
-- 止めたはずの相手が読めた・書けたときだけなので、振る舞いで見る。
--
-- 各操作は __try の中で巻き戻すので互いに影響しない。最後に ROLLBACK するので DB には何も残らない。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

BEGIN;

-- 1件の操作を、指定ロール・指定ユーザーで流して結果を返す。操作は必ず巻き戻す。
CREATE FUNCTION public.__try(p_role text, p_uid uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n bigint;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__ok__' || n;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '\_\_ok\_\_%' THEN
      RETURN 'OK rows=' || substr(SQLERRM, 7);
    END IF;
    RETURN 'ERR ' || SQLSTATE || ' ' || SQLERRM;
  END;
END $f$;

-- 書いたあとに保存された値を1つ読む版（同意者の上書きの確認用）。これも巻き戻す
CREATE FUNCTION public.__try_keep(p_role text, p_uid uuid, p_sql text, p_read text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql;
    RESET ROLE;
    EXECUTE p_read INTO v;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__ok__' || coalesce(v, 'NULL');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '\_\_ok\_\_%' THEN
      RETURN 'OK stored=' || substr(SQLERRM, 7);
    END IF;
    RETURN 'ERR ' || SQLSTATE || ' ' || SQLERRM;
  END;
END $f$;

-- ── 固定データ（postgres で入れる）──
INSERT INTO auth.users (id) VALUES
  ('00000000-0000-4000-8000-00000000a001'),  -- 元請け A の owner
  ('00000000-0000-4000-8000-00000000b001'),  -- 施工店 B の owner
  ('00000000-0000-4000-8000-00000000c001');  -- 外注 S の owner
INSERT INTO public.tenants (id, name, slug) VALUES
  ('00000000-0000-4000-8000-0000000000aa', 'A', 'rls-hardening-a'),
  ('00000000-0000-4000-8000-0000000000bb', 'B', 'rls-hardening-b'),
  ('00000000-0000-4000-8000-0000000000cc', 'S', 'rls-hardening-s');
INSERT INTO public.tenant_memberships (tenant_id, user_id, role) VALUES
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000a001', 'owner'),
  ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-00000000b001', 'owner'),
  ('00000000-0000-4000-8000-0000000000cc', '00000000-0000-4000-8000-00000000c001', 'owner');

INSERT INTO public.market_vehicles (id, tenant_id, maker, model, status, cost_price, supplier_name, buyer_info, chassis_number) VALUES
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000000aa', 'トヨタ', 'プリウス', 'listed', 1000000, '仕入先X', '{"name":"買主"}', 'ZVW30-0000001'),
  ('00000000-0000-4000-8000-0000000a0002', '00000000-0000-4000-8000-0000000000aa', 'ホンダ', 'フィット', 'draft', 500000, '仕入先Y', NULL, NULL);
INSERT INTO public.market_vehicle_images (vehicle_id, tenant_id, storage_path) VALUES
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000000aa', 'tenants/a/1.jpg');

INSERT INTO public.manufacturers (id, name) VALUES
  ('00000000-0000-4000-8000-00000000f001', 'M'), ('00000000-0000-4000-8000-00000000f002', 'M2');
INSERT INTO public.ft_projects (id, name, manufacturer_id) VALUES
  ('00000000-0000-4000-8000-0000000e0001', 'P', '00000000-0000-4000-8000-00000000f001');
INSERT INTO public.ft_recruitments (id, project_id, manufacturer_id, title, is_open) VALUES
  ('00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-00000000f001', 'R1', true),
  ('00000000-0000-4000-8000-0000000d0002', '00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-00000000f001', 'R2', true),
  ('00000000-0000-4000-8000-0000000d0003', '00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-00000000f001', 'R3', true);
INSERT INTO public.ft_applications (id, recruitment_id, project_id, manufacturer_id, tenant_id, status, review_notes) VALUES
  ('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-0000000000bb', 'pending', NULL),
  ('00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-0000000d0002', '00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-0000000000bb', 'rejected', '書類不足');
INSERT INTO public.ft_agreements (id, project_id, manufacturer_id, tenant_id, agreement_type, document_text) VALUES
  ('00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-0000000000bb', 'nda', 'メーカーの契約本文');
INSERT INTO public.ft_jobs (id, project_id, manufacturer_id, tenant_id, title, status) VALUES
  ('00000000-0000-4000-8000-0000000a1001', '00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-0000000000bb', 'J', 'assigned');

INSERT INTO public.staff_members (id, tenant_id, name, kind, linked_tenant_id) VALUES
  ('00000000-0000-4000-8000-000000051001', '00000000-0000-4000-8000-0000000000aa', '外注（未連携）', 'external', NULL),
  ('00000000-0000-4000-8000-000000051002', '00000000-0000-4000-8000-0000000000aa', '外注（S と連携済み）', 'external', '00000000-0000-4000-8000-0000000000cc');

-- ── 検査 ──
\set A '''00000000-0000-4000-8000-00000000a001'''
\set B '''00000000-0000-4000-8000-00000000b001'''
CREATE TEMPORARY TABLE __rls_results AS
SELECT label, result, expected FROM (VALUES
 ('01 [攻撃] anon: market_vehicles の出品中を読む', public.__try('anon', NULL, $q$SELECT * FROM public.market_vehicles$q$), 'OK rows=0'),
 ('02 [攻撃] anon: 出品中の画像を読む', public.__try('anon', NULL, $q$SELECT * FROM public.market_vehicle_images$q$), 'OK rows=0'),
 ('03 [攻撃] 他テナント B: A の出品中の仕入原価・仕入先・買主・車台番号を読む', public.__try('authenticated', :B, $q$SELECT cost_price, supplier_name, buyer_info, chassis_number FROM public.market_vehicles WHERE cost_price IS NOT NULL$q$), 'OK rows=0'),
 ('04 [攻撃] 他テナント B: A の画像を読む', public.__try('authenticated', :B, $q$SELECT * FROM public.market_vehicle_images$q$), 'OK rows=0'),
 ('05 [正規] A: 自社の在庫（下書き含む）を全列で読む', public.__try('authenticated', :A, $q$SELECT cost_price, supplier_name, chassis_number FROM public.market_vehicles$q$), 'OK rows=2'),
 ('06 [正規] A: 自社の画像を読む', public.__try('authenticated', :A, $q$SELECT * FROM public.market_vehicle_images$q$), 'OK rows=1'),
 ('07 [正規] A: 自社の車両を更新', public.__try('authenticated', :A, $q$UPDATE public.market_vehicles SET asking_price = 1 WHERE id = '00000000-0000-4000-8000-0000000a0001'$q$), 'OK rows=1'),
 ('08 [正規] service role: /market の出品中一覧（公開列）', public.__try('service_role', NULL, $q$SELECT id, maker, model, asking_price, wholesale_price FROM public.market_vehicles WHERE status = 'listed'$q$), 'OK rows=1'),
 ('09 [攻撃] anon: customer_inquiries に直接挿入', public.__try('anon', NULL, $q$INSERT INTO public.customer_inquiries (tenant_id, message, status, admin_reply) VALUES ('00000000-0000-4000-8000-0000000000aa', 'x', 'replied', '偽の返信')$q$), 'ERR 42501'),
 ('10 [攻撃] authenticated B: customer_inquiries に A 宛てで直接挿入', public.__try('authenticated', :B, $q$INSERT INTO public.customer_inquiries (tenant_id, message) VALUES ('00000000-0000-4000-8000-0000000000aa', 'x')$q$), 'ERR 42501'),
 ('11 [正規] service role: 問い合わせの挿入', public.__try('service_role', NULL, $q$INSERT INTO public.customer_inquiries (tenant_id, message) VALUES ('00000000-0000-4000-8000-0000000000aa', 'x')$q$), 'OK rows=1'),
 ('12 [攻撃] B: 自分の応募を approved にする', public.__try('authenticated', :B, $q$UPDATE public.ft_applications SET status = 'approved' WHERE id = '00000000-0000-4000-8000-0000000c0001'$q$), 'ERR 42501'),
 ('13 [攻撃] B: approved の応募を新規で入れる', public.__try('authenticated', :B, $q$INSERT INTO public.ft_applications (recruitment_id, project_id, manufacturer_id, tenant_id, status) VALUES ('00000000-0000-4000-8000-0000000d0003', '00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-0000000000bb', 'approved')$q$), 'ERR 42501'),
 ('14 [攻撃] B: 応募の manufacturer_id を付け替える', public.__try('authenticated', :B, $q$UPDATE public.ft_applications SET manufacturer_id = '00000000-0000-4000-8000-00000000f002' WHERE id = '00000000-0000-4000-8000-0000000c0001'$q$), 'ERR 42501'),
 ('15 [正規] B: 応募の作成（createApplication）', public.__try('authenticated', :B, $q$INSERT INTO public.ft_applications (recruitment_id, project_id, manufacturer_id, tenant_id, applied_by, notes) VALUES ('00000000-0000-4000-8000-0000000d0003', '00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-00000000b001', 'よろしく')$q$), 'OK rows=1'),
 ('16 [正規] B: 応募の取り下げ（withdrawApplication）', public.__try('authenticated', :B, $q$UPDATE public.ft_applications SET status = 'withdrawn' WHERE id = '00000000-0000-4000-8000-0000000c0001' AND tenant_id = '00000000-0000-4000-8000-0000000000bb' AND status IN ('pending')$q$), 'OK rows=1'),
 ('17 [正規] B: 不採用からの再応募（createApplication の revive）', public.__try('authenticated', :B, $q$UPDATE public.ft_applications SET status = 'pending', applied_by = '00000000-0000-4000-8000-00000000b001', notes = '再提出', review_notes = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = now() WHERE recruitment_id = '00000000-0000-4000-8000-0000000d0002' AND tenant_id = '00000000-0000-4000-8000-0000000000bb' AND status IN ('withdrawn', 'rejected')$q$), 'OK rows=1'),
 ('18 [攻撃] B: 契約本文を書き換える', public.__try('authenticated', :B, $q$UPDATE public.ft_agreements SET document_text = '施工店が書き換えた本文' WHERE id = '00000000-0000-4000-8000-0000000b0001'$q$), 'ERR 42501'),
 ('19 [攻撃] B: 本文を書き換えながら同意する', public.__try('authenticated', :B, $q$UPDATE public.ft_agreements SET accepted = true, document_text = '施工店が書き換えた本文' WHERE id = '00000000-0000-4000-8000-0000000b0001'$q$), 'ERR 42501'),
 ('20 [正規] B: 契約への同意（acceptAgreement）', public.__try('authenticated', :B, $q$UPDATE public.ft_agreements SET accepted = true, accepted_by = '00000000-0000-4000-8000-00000000b001', accepted_at = now() WHERE id = '00000000-0000-4000-8000-0000000b0001' AND tenant_id = '00000000-0000-4000-8000-0000000000bb' AND accepted = false$q$), 'OK rows=1'),
 ('21 [攻撃] B: 同意者を A の利用者・日付を 2020 年に偽って同意 → 本人と今の時刻で残る', public.__try_keep('authenticated', :B, $q$UPDATE public.ft_agreements SET accepted = true, accepted_by = '00000000-0000-4000-8000-00000000a001', accepted_at = '2020-01-01' WHERE id = '00000000-0000-4000-8000-0000000b0001'$q$, $q$SELECT accepted_by::text || ' / ' || (accepted_at = now())::text FROM public.ft_agreements WHERE id = '00000000-0000-4000-8000-0000000b0001'$q$), 'OK stored=00000000-0000-4000-8000-00000000b001 / true'),
 ('22 [攻撃] B: 案件を completed にする', public.__try('authenticated', :B, $q$UPDATE public.ft_jobs SET status = 'completed' WHERE id = '00000000-0000-4000-8000-0000000a1001'$q$), 'ERR 42501'),
 ('23 [攻撃] B: 案件の manufacturer_id を付け替える', public.__try('authenticated', :B, $q$UPDATE public.ft_jobs SET manufacturer_id = '00000000-0000-4000-8000-00000000f002' WHERE id = '00000000-0000-4000-8000-0000000a1001'$q$), 'ERR 42501'),
 ('24 [正規] B: 案件を assigned → in_progress（updateTenantFtJobStatus）', public.__try('authenticated', :B, $q$UPDATE public.ft_jobs SET status = 'in_progress' WHERE id = '00000000-0000-4000-8000-0000000a1001' AND tenant_id = '00000000-0000-4000-8000-0000000000bb' AND status = 'assigned'$q$), 'OK rows=1'),
 ('25 [正規] service role（メーカー側）: 案件を completed にする', public.__try('service_role', NULL, $q$UPDATE public.ft_jobs SET status = 'completed' WHERE id = '00000000-0000-4000-8000-0000000a1001'$q$), 'OK rows=1'),
 ('26 [攻撃] A owner: 未連携の外注に B を連携先として直接入れる', public.__try('authenticated', :A, $q$UPDATE public.staff_members SET linked_tenant_id = '00000000-0000-4000-8000-0000000000bb' WHERE id = '00000000-0000-4000-8000-000000051001'$q$), 'ERR 42501'),
 ('27 [攻撃] A owner: B と連携済みの職人を新規作成', public.__try('authenticated', :A, $q$INSERT INTO public.staff_members (tenant_id, name, kind, linked_tenant_id) VALUES ('00000000-0000-4000-8000-0000000000aa', '偽の外注', 'external', '00000000-0000-4000-8000-0000000000bb')$q$), 'ERR 42501'),
 ('28 [攻撃] A owner: S と連携済みの職人の連携先を B に差し替え', public.__try('authenticated', :A, $q$UPDATE public.staff_members SET linked_tenant_id = '00000000-0000-4000-8000-0000000000bb' WHERE id = '00000000-0000-4000-8000-000000051002'$q$), 'ERR 42501'),
 ('29 [正規] A owner: 職人の名前・メモを更新（/api/admin/staff PATCH）', public.__try('authenticated', :A, $q$UPDATE public.staff_members SET name = '改名', note = 'メモ', updated_at = now() WHERE id = '00000000-0000-4000-8000-000000051002'$q$), 'OK rows=1'),
 ('30 [正規] A owner: 職人の新規作成（/api/admin/staff POST）', public.__try('authenticated', :A, $q$INSERT INTO public.staff_members (tenant_id, name, kind) VALUES ('00000000-0000-4000-8000-0000000000aa', '新しい外注', 'external')$q$), 'OK rows=1'),
 ('31 [正規] service role: 連携コードの引き換え（redeemStaffLinkInvite）', public.__try('service_role', NULL, $q$UPDATE public.staff_members SET linked_tenant_id = '00000000-0000-4000-8000-0000000000cc' WHERE id = '00000000-0000-4000-8000-000000051001' AND tenant_id = '00000000-0000-4000-8000-0000000000aa'$q$), 'OK rows=1'),
 ('32 [正規] service role: 連携の解除（unlinkStaffTenant）', public.__try('service_role', NULL, $q$UPDATE public.staff_members SET linked_tenant_id = NULL WHERE id = '00000000-0000-4000-8000-000000051002' AND tenant_id = '00000000-0000-4000-8000-0000000000aa'$q$), 'OK rows=1')
) t(label, result, expected);

DO $$
DECLARE bad text;
BEGIN
  -- 'ERR 42501' は前方一致、それ以外は完全一致（'OK rows=1' が 'OK rows=10' に当たらないように）
  SELECT string_agg(label || ' → ' || result || '（期待: ' || expected || '）', E'\n  ' ORDER BY label) INTO bad
  FROM __rls_results
  WHERE NOT (result = expected OR (expected LIKE 'ERR %' AND result LIKE expected || ' %'));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION E'RLS の境界が期待と違う:\n  %', bad;
  END IF;
  IF (SELECT count(*) FROM __rls_results) <> 32 THEN
    RAISE EXCEPTION '検査の件数が 32 ではない（%）', (SELECT count(*) FROM __rls_results);
  END IF;
END $$;

ROLLBACK;
