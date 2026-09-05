-- ============================================================
-- Academy 公開事例は「全加盟店で共有するライブラリ」であって、
-- インターネット全体への公開ではない（2026-09-05 代表判断）
-- ============================================================
--
-- 見つかった状態:
--   academy_cases_read_published  FOR SELECT  USING (is_published = true)
--   → ロールの指定が無く PUBLIC 扱い。つまり **anon でも読めた**。
--
-- anon キーはブラウザのバンドルに載って配布されるので、実質「公開事例は
-- 誰でも読める」状態だった。academy_cases は photos（施工写真）と
-- vehicle_info（車両情報）を持つ。公開時に anonymized = true は立てるが、
-- それは店名を伏せるだけで、写真そのものは伏せない。
--
-- 本番で実際に anon ロールから読めることを確認済み（一時行を入れて数え、削除した）。
--
-- 判断は「全加盟店で共有」。加盟店＝ログイン済みユーザーなので authenticated に絞る。
-- 公開側（未認証）で academy_cases を読んでいる画面は無いことを確認済み
-- （読み出しは 9 箇所すべて /admin 配下かサーバ側の AI 経路）。
--
-- 「任意で非公開」は既存の仕組みで足りる。POST /api/admin/academy/cases の
-- action: "unpublish" が is_published を false に戻し、所有テナントも検査している。
-- 画面にボタンが無かっただけなので、そちらは同じ PR のアプリ側で足した。

DROP POLICY IF EXISTS academy_cases_read_published ON academy_cases;

CREATE POLICY academy_cases_read_published ON academy_cases
  FOR SELECT
  TO authenticated
  USING (is_published = true);
