-- =============================================================
-- current_insurer_id() を削除する（棚卸し）
--
-- 出典: OPEN_QUESTIONS / DECISION_LOG 2026-09-22 (8)(c)「current_insurer_id() の棚卸し【要確認】」
--
-- この関数は SECURITY DEFINER・service_role のみ GRANT で残っていたが、**停止
-- （suspended）判定を持たず**、現行では呼び出し元が1つも無い（2026-09-24 実測）:
--   - コード（src/**）        : 0 件（型定義 db.generated.ts・コメント・GRANT/REVOKE のみ）
--   - 本番 pg_proc の他関数本体: 0 件
--   - 本番 pg_policies         : 0 件
--
-- 役割は current_insurer_access()（1件選択＋停止判定）と my_insurer_ids()
-- （集合＋停止判定・RLS 用）へ完全移行済み。停止判定を持たない孤立関数を
-- service_role GRANT のまま残すと、将来サービスロール経路から誤って使われた
-- とき停止ゲートを素通りする穴になりうる。使われていない今のうちに削除する。
--
-- 冪等: IF EXISTS。引数無し関数なのでシグネチャは () で一意。
-- =============================================================

DROP FUNCTION IF EXISTS public.current_insurer_id();
