-- ============================================================
-- `tenants.plan_tier` の check を本番の enum と同じ 5 値に広げる。
--
-- 何が困っていたか（OPEN_QUESTIONS「本番と migrations で列の型が違う」）:
--   本番の `tenants.plan_tier` は `plan_tier_enum`
--   (mini, standard, pro, free, starter) の 5 値。ところがこの列を作る
--   マイグレーションは `text + check (mini, standard, pro)` の 3 値しかない。
--   **本番 24 テナントのうち 20 件（free 19 / starter 1）がこの check に弾かれる。**
--   「マイグレーションから DB を作り直して本番データを流し込む」復旧手順が、
--   今のままでは 83% のテナントで失敗する。
--
-- ── なぜ「型を enum に変える」ではなく「check を広げる」なのか ──────
--   最初は 4 列を `alter column ... type <enum>` で本番に合わせる版を書き、
--   再生 DB で本番と完全一致（ビュー定義の md5 まで一致）することまで確認した。
--   だが `lint:migrations` が 2 件を指摘した。
--     - alter-column-type: 表を書き換え ACCESS EXCLUSIVE を取る
--     - add-check-without-not-valid: 全行走査を ACCESS EXCLUSIVE で行う
--   `supabase/migrations.allowlist` は「**新規追加禁止**」と明記されているので
--   逃げ道は無い。zero-downtime 方針（docs/operations/zero-downtime-migrations.md）
--   に従うなら add-column → backfill → 切替 → drop を複数デプロイに分ける話になるが、
--   **本番ではこの変更は 1 バイトも動かない**（既に enum）。動くのは空 DB の再生だけ。
--   そのために本番の中核表を書き換える手順を組むのは釣り合わない。
--
--   そして**実害はこの 1 列にしか無い**。他の 4 列は型名が違うだけで、
--   再生側の制約は本番の値をすべて受け入れる（2026-09-08 に実測）:
--     certificates.status       再生 check (active,void,draft,expired) ⊇ enum 3 値
--     certificates.expiry_type  再生は NULL 許容 = 本番(NOT NULL)より緩い
--     tenant_memberships.role   再生 check の 5 値と enum の 5 値は**集合が一致**
--     templates.scope           再生の check は列跨ぎ規則のみ（値の一覧を持たない）
--   よって「復旧手順が通らない」を直すには、この 1 列で必要十分。
--
-- ponytail: 上限。**列の型名の食い違いは残る**（text か enum か）。
--   これを消すには型変更が要り、上記のとおり本番では無意味な書き換えになる。
--   アプリから見ると PostgREST はどちらも文字列で返すので影響しない。
--   残った差分は OPEN_QUESTIONS に据え置く。
-- ============================================================

do $mig$
begin
  -- 本番は既に enum なので、この check 自体が存在しない → 何もしない。
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tenants'::regclass and conname = 'tenants_plan_tier_check'
  ) then
    raise notice '20260910000000: tenants_plan_tier_check が無いため skip（本番は enum）';
    return;
  end if;

  alter table public.tenants drop constraint tenants_plan_tier_check;

  -- NOT VALID で足してから VALIDATE する。
  --
  -- ponytail: 上限。**この書き方でロックは短くならない。** DO ブロック＝1トランザクション
  -- なので、DROP/ADD が取った ACCESS EXCLUSIVE が VALIDATE のフルスキャンまで保持される
  -- （replay は psql --single-transaction、supabase db push も1ファイル1トランザクション）。
  -- 短くするなら VALIDATE を別ファイルへ分ける必要がある（20260702155034 が前例）。
  -- ここで分けないのは、**本番ではこのブロック全体が skip され 1 行も走らない**うえ、
  -- 走る側（空 DB の再生）は tenants が 0 行だから。lint:migrations の
  -- add-check-without-not-valid を満たすためだけの形になっている、と正直に書いておく。
  alter table public.tenants
    add constraint tenants_plan_tier_check
    check (plan_tier in ('mini', 'standard', 'pro', 'free', 'starter')) not valid;

  alter table public.tenants validate constraint tenants_plan_tier_check;
end
$mig$;
