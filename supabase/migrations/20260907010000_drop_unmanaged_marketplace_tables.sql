-- ============================================================
-- マイグレーションを通さず本番へ入り、その後どこからも使われなくなった
-- テーブル23本と、それだけを読んでいた関数5本を落とす。
--
-- 経緯（OPEN_QUESTIONS / DECISION_LOG 2026-09-06）:
--   本番 public のオブジェクト名と supabase/migrations の CREATE 文を突き合わせた
--   ところ、テーブル23・ビュー1・関数24・トリガ15・enum型5・イベントトリガ1 が
--   マイグレーションに定義を持たなかった。このファイルはそのうち
--   **消してよいと確認できたテーブル**と、それに付随して死ぬ関数を落とす。
--   残り（本番に必要なもの）は同日の repair ファイルで書き起こす。
--
-- 消してよいと確認した根拠（2026-09-06 実測）:
--   - 23本の合計行数は 2 行（21本が 0 行）
--   - `src` / `apps` からの参照ゼロ（`db.generated.ts` の型定義を除く）
--   - 外部キーで参照している「残す側」のテーブルは 0 本
--     （public の外部キー 562 本のうち、この23本を指すものは23本の内側だけ）
--
-- **無害ではなかった3本**（当初「未使用」と分類しかけたもの）:
--   `dealers` / `dealer_users` は関数 5 本が読み、その関数を 26 本の RLS ポリシーが
--   使っていた。ただし参照元テーブル 10 本のうち 9 本はこの削除対象で、
--   生き残るのは `job_orders` の `read_jobs` だけだった。
--   `insurer_subscriptions` は `insurer_is_active_subscription()` だけが読み、
--   その関数はポリシーからもアプリからも呼ばれていなかった。
--
-- ponytail: 空 DB ではこの23本がそもそも作られないので、全文が no-op になる。
--   `if exists` を付けてあるのはそのため（再生検査を通すための飾りではない）。
-- ============================================================

-- ── 1. 残る表に付いた、削除対象の関数を使うポリシー ──────────
-- pg_depend で洗ったところ、削除対象の関数に依存するポリシーは 36 本あり、
-- そのうち **3 本だけが削除対象外のテーブルに付いていた**。
--
-- `job_orders.read_jobs` は `is_approved_dealer()` を使う PERMISSIVE な SELECT
-- ポリシーで、**承認済みディーラーに全テナントの発注を横断的に読ませる**。
-- `dealers` が 0 行なので現時点では 1 行も通していないが、形は 2026-09 の
-- 越境アクセス（insurer_tenant_accesses）と同じ。正規の読み取りは
-- `job_orders_select_v4`（自テナント発注 / 自テナント受注）が担っており、
-- これを落としても正規の経路は変わらない。
drop policy if exists "read_jobs" on public.job_orders;

-- `storage.objects` の 2 本はマーケットプレイス（assets バケットの market/ 配下）の
-- 出品画像用。どちらも `market_is_approved_dealer()` を AND で含み、
-- **同関数は dealer_users が 0 行なので常に false** ＝ 現時点で 1 件も通していない。
-- アプリの `assets` バケットへのアップロードはサービスロール（RLS を迂回する）で
-- 行われているため、この 2 本を落としても実際の書き込み経路は変わらない。
-- storage.objects のポリシー削除は 20260616000003 に前例がある。
drop policy if exists "assets_upload" on storage.objects;
drop policy if exists "assets_delete" on storage.objects;

-- ── 2. テーブル23本 ─────────────────────────────────────────
-- cascade は「この23本の内側で閉じた」外部キー・ポリシー・トリガ・索引を畳むため。
-- 外向きの依存が無いことは上のコメントの実測で確認済み。
drop table if exists public.certificate_maintenance_logs cascade;
drop table if exists public.dealer_users                 cascade;
drop table if exists public.dealers                      cascade;
drop table if exists public.deals                        cascade;
drop table if exists public.error_events                 cascade;
drop table if exists public.industry_news                cascade;
drop table if exists public.inquiry_messages             cascade;
drop table if exists public.insurer_subscriptions        cascade;
drop table if exists public.inventory_listings           cascade;
drop table if exists public.job_bids                     cascade;
drop table if exists public.line_follow_events           cascade;
drop table if exists public.line_link_audit_logs         cascade;
drop table if exists public.line_link_candidates         cascade;
drop table if exists public.line_link_sessions           cascade;
drop table if exists public.line_link_tokens             cascade;
drop table if exists public.line_pending_links           cascade;
drop table if exists public.listing_images               cascade;
drop table if exists public.listing_inquiries            cascade;
drop table if exists public.operator_users               cascade;
drop table if exists public.shop_price_submissions       cascade;
drop table if exists public.support_ticket_messages      cascade;
drop table if exists public.support_tickets              cascade;
drop table if exists public.system_health_snapshots      cascade;

-- ── 3. 上の表しか読んでいなかった関数 ───────────────────────
-- cascade は付けない。まだ誰かが参照していればここで**落ちてほしい**
-- （黙って道連れにするより、止まって理由を見るほうがよい）。
drop function if exists public.is_approved_dealer();
drop function if exists public.my_dealer_id();
drop function if exists public.market_is_approved_dealer();
drop function if exists public.market_my_dealer_id();
drop function if exists public.insurer_is_active_subscription(uuid);

-- `update_updated_at_column()` は「updated_at に now() を入れる」だけの関数が
-- 3 本ある（`set_updated_at` / `handle_updated_at` / これ）うちの1本で、
-- 使っていたトリガ 4 本が**全部この削除対象テーブルの上**にあった。
-- 上の drop table で 4 本とも消えるので、ここで完全に孤立する。
-- `handle_updated_at` のほうは消さない。**本番の `trg_job_orders_updated_at` が
-- これを呼んでいる**（実測）。ただしそのトリガを作る
-- `20260317000004_job_orders.sql` は `set_updated_at()` で作っており、
-- **同じ名前のトリガが本番と再生 DB で違う関数を呼んでいる**。
-- 中身はどちらも `NEW.updated_at = now()` なので挙動は同じだが、定義は食い違う。
-- 名前だけを見るドリフト検出器ではこの差は出ない（検出器の上限。
-- OPEN_QUESTIONS「本番と migrations で列の型が違う」の項に併記）。
drop function if exists public.update_updated_at_column();

-- ── 4. 呼び出せない overload ────────────────────────────────
-- `search_vehicles_for_cartrust` は 3 引数版と 4 引数版が両方あり、4 引数版の
-- `p_status` に既定値があるため、**3 引数で呼ぶと必ず曖昧になる**。
--   ERROR: function public.search_vehicles_for_cartrust(text, integer, integer) is not unique
-- 本番でも同じ（2026-09-06 に実際に呼んで確認）。つまり 3 引数版は
-- **どうやっても呼べない**。アプリからの参照もゼロ（`db.generated.ts` の型を除く）。
-- 落とすと 3 引数の呼び出しが 4 引数版（`p_status` 既定 'all'）へ解決するようになり、
-- 今エラーになる呼び方が通るようになる。壊れるものは無い。
drop function if exists public.search_vehicles_for_cartrust(text, integer, integer);
