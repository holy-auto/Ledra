-- 既定値が「自分の表の CHECK に弾かれる」列を2つ直す。
--
-- 何が起きていたか
-- ----------------
-- 2026-09-27 に本番の (既定値, 単一列 CHECK) の組 183 件を**本番自身に評価させた**
-- （同じ型・同じ既定・同じ CHECK の一時テーブルを作り `INSERT DEFAULT VALUES` する）。
-- 評価不能 0 件で、違反が2件出た。
--
--   | 列                    | 本番の既定 | 同じ表の CHECK が許す値                                           |
--   |-----------------------|-----------|------------------------------------------------------------------|
--   | `job_orders.status`   | `'open'`  | pending / quoting / accepted / in_progress / approval_pending /   |
--   |                       |           | payment_pending / completed / rejected / cancelled               |
--   | `insurer_users.role`  | `'member'`| admin / viewer / auditor                                         |
--
-- つまりどちらも、**列を省いて insert すると本番で必ず 23514 で落ちる**。
-- 既定値が一度も使えない状態だった。
--
-- 誰が踏むか
-- ----------
-- **アプリの経路**はどちらも列を明示で渡しているので、本番で実害は出ていない。
--   - `job_orders`: `src/app/api/admin/orders/route.ts` が `status: "pending"` を渡す
--   - `insurer_users`: `src/app/api/insurer/users/route.ts` が要求の `role` を渡し、
--     システム行を作る `ensure_insurer_system_actor()`（20260924133200）は `'viewer'` を渡す
--
-- ただし**リポジトリの中には既に `role` を省く書き手がある**:
-- `scripts/replay/checks/insurer_suspension_gate.sql:35` は `role` を渡さず既定値に任せている。
-- 再生では既定が `'viewer'`（CHECK が許す）なので通り、本番の既定 `'member'` なら落ちる。
-- **つまりこの検査は、本番では成立しない前提の上で緑になっていた。** 食い違いの実物である
-- （この事実は本 PR の陰性対照で、本番の既定値を再生側に入れた瞬間に判明した）。
-- 列を省く書き手はもう存在するので、既定値の側を直す。
--
-- なぜ本番に合わせず本番を直すのか
-- --------------------------------
-- 「食い違いは本番へ寄せる」が原則だが、**本番の値がその表自身の CHECK に
-- 弾かれる場合は本番が誤り**で、寄せる先が無い。直す向きは CHECK が決めている。
--   - `job_orders.status` → `'pending'`: CHECK の先頭の値で、アプリが実際に入れている値。
--     マイグレーション側の既定も元から `'pending'` だった。
--   - `insurer_users.role` → `'viewer'`: CHECK が許す3つのうち**最も弱い権限**。
--     省略時に強い権限が付くことを避ける。20260924133200 が同じ理由で `'viewer'` を選んでいる。
--
-- 再発防止は `scripts/replay/checks/defaults_satisfy_own_check.sql`（同じ PR）。
-- 同じ類型は 2026-09-22 の `certificate_images.file_size`（既定 0 と CHECK > 0）で
-- 一度出ている（#1124 / DECISION_LOG 2026-09-22〜23）。今回で3件目。

ALTER TABLE public.job_orders
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.insurer_users
  ALTER COLUMN role SET DEFAULT 'viewer';
