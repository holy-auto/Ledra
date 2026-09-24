-- 自動処理（AI の案件サマリ・担当提案・不正スコア）が監査行を残せるようにする (1/4: 列)。
--
-- 何が起きていたか
-- ----------------
-- `caseSummaryAuto` / `caseAssignAuto` / `fraudScoreAuto` の3本は
-- `insurer_access_logs` に `insurer_id` / `action` / `meta` だけで insert していた。
-- `insurer_user_id` は NOT NULL・既定なしなので、**この3本は毎回 23502 で落ちる。**
-- `.then(() => {})` で戻り値を捨てていたため、例外にもログにも現れなかった。
-- 2026-09-24 に本番で実測:
--
--   ERROR 23502: null value in column "insurer_user_id" of relation
--                "insurer_access_logs" violates not-null constraint
--
-- 2026-09-23 の #1135（CHECK を 20 値へ広げる）はこの3本を直していない。
-- 語彙には `case_summary_auto` 等が入ったが、NOT NULL で先に落ちる。
--
-- なぜこの形にしたか（代表判断 2026-09-24、DECISION_LOG 参照）
-- ------------------------------------------------------------
-- 「保険会社ごとにシステム用ユーザーを1行持ち、その id を使う」を採用。
-- `insurer_access_logs.insurer_user_id` には `insurer_users(id)` への外部キーが
-- 2本あるので（`fk_ial_insurer_user` と `insurer_access_logs_insurer_user_fk`）、
-- 行が実在しないと insert できない。
--
-- ただし `insurer_users.user_id` は `auth.users(id)` への外部キーで NOT NULL。
-- **ログインできる偽アカウントは作らない**ため、`user_id` を NULL 可にし、
-- `is_system` の行だけが NULL を持てる形にした。RLS のポリシーはすべて
-- `iu.user_id = auth.uid()` の等値比較なので、`user_id IS NULL` の行は
-- どの利用者にも一致しない（NULL = X は true にならない）＝**権限を一切与えない。**
-- 2026-09-24 に本番で、この表を参照するポリシー7本すべてがこの形であることを確認済み。

ALTER TABLE public.insurer_users
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.insurer_users
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- 形の不整合を禁じる。人なのに user_id が無い／システムなのに user_id がある、を止める。
-- 既存行（すべて人・user_id あり）は満たすが、規約どおり NOT VALID で足し、
-- VALIDATE は 20260924133300 で行う。
ALTER TABLE public.insurer_users
  ADD CONSTRAINT insurer_users_system_actor_shape_check
  CHECK (
    (is_system AND user_id IS NULL) OR (NOT is_system AND user_id IS NOT NULL)
  )
  NOT VALID;
