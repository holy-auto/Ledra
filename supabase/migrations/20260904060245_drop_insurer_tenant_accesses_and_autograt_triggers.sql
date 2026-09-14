-- 使われていない複数形テーブル insurer_tenant_accesses と、
-- 全組み合わせを自動付与するトリガ2本を削除する。
--
-- ■ 背景
-- 保険会社のテナント閲覧許可には、名前がほぼ同じ2つの表が並存していた。
--
--   public.insurer_tenant_access   (単数形) … 本番で実際に使われている正
--   public.insurer_tenant_accesses (複数形) … 誰も読んでいない
--
-- 認可の実体である insurer_accessible_tenant_ids() と、それを呼ぶ
-- insurer_search_certificates / insurer_search_stores / insurer_search_vehicles、
-- および API 4本（admin/insurers/tenant-access, insurer/btob-match,
-- insurer/tenants, insurer/vehicles/[id]）は**すべて単数形を読む**。
-- 複数形を参照していたのは、下で削除するトリガ関数2本だけだった
-- （pg_proc / pg_policies の全走査で確認。RLS ポリシーからの参照はゼロ）。
--
-- ■ なぜ危険だったか
-- トリガ trg_seed_all_tenant_accesses_for_new_insurer /
-- trg_seed_all_insurer_accesses_for_new_tenant は、保険会社またはテナントが
-- 1件増えるたびに「全保険会社 × 全テナント」の行を is_active=true で
-- 複数形テーブルへ投入していた。削除時点の中身は 2保険会社 × 24テナント = 48行、
-- **全件有効**。実店舗テナントを含む全社が、両保険会社に開放された状態で
-- 溜まり続けていた。読むコードが無いので実害は出ていなかったが、
-- **複数形を1行でも参照した瞬間に全テナントの証明書が両保険会社から見える**。
-- 認可を「既定で全開放」する仕掛けが、誰も見ていない場所で動き続けていた。
--
-- ■ この表・トリガはマイグレーション未登録だった
-- supabase/migrations/ を全文検索しても insurer_tenant_accesses および
-- seed_all_* トリガの定義は1件も無い（本番にだけ存在するドリフト）。
-- したがって、まっさらな DB を migrations から作り直した環境には
-- そもそも存在しない。削除してもリプレイ結果は変わらない。
--
-- ■ 復元が必要になった場合
-- 削除時点の48行は「2保険会社 × 24テナント の全組み合わせ、
-- is_enabled=true / is_active=true」であり、個別に意味のある設定は入っていない
-- （明細は docs/context/DECISION_LOG.md 2026-09-04 のエントリに記録）。
-- 正である単数形 insurer_tenant_access には影響しない。

DROP TRIGGER IF EXISTS trg_seed_all_tenant_accesses_for_new_insurer ON public.insurers;
DROP TRIGGER IF EXISTS trg_seed_all_insurer_accesses_for_new_tenant ON public.tenants;

DROP FUNCTION IF EXISTS public.seed_all_tenant_accesses_for_new_insurer();
DROP FUNCTION IF EXISTS public.seed_all_insurer_accesses_for_new_tenant();

DROP TABLE IF EXISTS public.insurer_tenant_accesses;
