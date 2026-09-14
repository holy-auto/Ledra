-- ============================================================
-- 本番にあるがマイグレーションが作らない列を、マイグレーション側に取り込む
--
-- 経緯:
--   `audit_logs` のずれ（コードが書く列が本番に無い）を追ったところ、同じ
--   「本番とマイグレーションの食い違い」が他にもあることが分かった。
--   マイグレーション 417 本を空 DB に流して本番の information_schema と
--   突き合わせた結果、**本番に存在するのにマイグレーション本文のどこにも
--   書かれていない列が 26 個 / 9 テーブル**あった（本文に書かれていて
--   再生順の破綻で作られなかっただけのものは除外済み）。
--
--   放置すると、空 DB から作った環境（新しい Supabase プロジェクト、
--   ステージングのリセット、Supabase Preview）でこれらの列が欠け、
--   同じコードが環境によって動いたり動かなかったりする。
--
-- ここでは**本番の定義（型・NOT NULL・既定値）をそのまま**取り込む。
-- 本番では全て IF NOT EXISTS で no-op になる。
--
-- 既存の repair_drift_* 系（20260731144359 / 20260815000000）と同じ性格の
-- 修復マイグレーション。
-- ============================================================

-- ── 顧客の LINE 連携状態 ────────────────────────────────────
alter table public.customers add column if not exists line_link_status  text not null default 'unlinked';
alter table public.customers add column if not exists line_link_source  text;
alter table public.customers add column if not exists line_linked_at    timestamptz;
alter table public.customers add column if not exists line_unlinked_at  timestamptz;
alter table public.customers add column if not exists line_unlink_reason text;

-- ── 契約（Stripe サブスクリプション）の状態 ────────────────
--    課金判定がここを読む。欠けると新環境で契約状態が読めない
alter table public.tenants add column if not exists subscription_status  text;
alter table public.tenants add column if not exists current_period_start timestamptz;
alter table public.tenants add column if not exists cancel_at            timestamptz;
alter table public.tenants add column if not exists cancel_at_period_end boolean not null default false;
alter table public.tenants add column if not exists trial_end            timestamptz;

-- ── 受注（案件）の募集条件 ──────────────────────────────────
alter table public.job_orders add column if not exists service_category text;
alter table public.job_orders add column if not exists desired_date     date;
alter table public.job_orders add column if not exists city             text;
alter table public.job_orders add column if not exists budget_min       integer;
alter table public.job_orders add column if not exists budget_max       integer;

-- ── 帳票の作業ステータス ────────────────────────────────────
alter table public.documents add column if not exists job_status text not null default 'draft';

-- ── 署名セッションの督促 ────────────────────────────────────
alter table public.signature_sessions add column if not exists remind_count     integer not null default 0;
alter table public.signature_sessions add column if not exists last_reminded_at timestamptz;
alter table public.signature_sessions add column if not exists notified_channel text;

-- ── 代理店の署名依頼（自社署名への切り替え） ────────────────
alter table public.agent_signing_requests add column if not exists sign_engine      text not null default 'cloudsign';
alter table public.agent_signing_requests add column if not exists sign_url         text;
alter table public.agent_signing_requests add column if not exists ledra_session_id uuid;
alter table public.agent_signing_requests add column if not exists ledra_verified   boolean not null default false;
alter table public.agent_signing_requests add column if not exists notified_channel text;

-- ── 保険会社ユーザーの最終ログイン ──────────────────────────
alter table public.insurer_users add column if not exists last_login_at timestamptz;

-- 注: `invoices.job_status` は本番にあるが、invoices は documents へ統合済みの
-- 旧テーブル（20260323010000_unify_invoices_to_documents）。新規に作る環境で
-- 必要になる列ではないため、ここでは取り込まない。
