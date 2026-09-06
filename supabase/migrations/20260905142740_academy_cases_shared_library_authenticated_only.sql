-- ============================================================
-- 適用記録: 2026-09-05 に本番へ適用済み（版 20260905142740）。
-- MCP の apply_migration は自前でタイムスタンプを振るため、当初 20260905040000 で
-- 作ったファイルを記録された版に改名した（docs/operations/migrations.md）。
-- 改名しないと、この版が未適用として残り out-of-order で db-migrate が止まる。
--
-- 適用後に本番で挙動を実測した:
--   anon から見えた件数: 0（適用前は 1）
--   authenticated から見えた件数: 1
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
-- 誰でも読める」状態だった。
--
-- 【2026-09-06 訂正】当初ここに「academy_cases は photos（施工写真）と
-- vehicle_info（車両情報）を持つ」と書いたが誤り。**列はあるが、どの書き込み経路でも
-- 設定されない。** 両列は NOT NULL DEFAULT（photos は '[]'、vehicle_info は '{}'）なので
-- **NULL にはならず、空の既定値のまま残る**（MISTAKE_LEDGER M-032）。
-- 「常に NULL」と書くと IS NULL での棚卸しが空振りするので、そう書かないこと。
-- anon に見えていたのは
-- AI 生成のテキストとメタデータで、施工写真ではない。ポリシーを絞る判断は変えないが、
-- 深刻度は当初の記述より軽い。本番は 0 件なので、いずれにせよ露出した実データは無い。
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
