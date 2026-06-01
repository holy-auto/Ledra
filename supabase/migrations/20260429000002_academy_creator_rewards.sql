-- ============================================================
-- Academy 投稿者報酬テーブル
-- - rating_avg >= 4.0 && rating_count >= 5 を満たすレッスンの
--   作者を月次集計し、Stripe Customer Balance に credit を付与する
-- - 新規空テーブルなのでインデックスは通常 CREATE INDEX で OK
-- ============================================================

CREATE TABLE IF NOT EXISTS academy_creator_rewards (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        REFERENCES tenants(id) ON DELETE CASCADE,
  author_user_id     uuid        NOT NULL,
  period_month       date        NOT NULL,
  -- 集計時スナップショット: [{id, title, rating_avg, rating_count}]
  qualifying_lessons jsonb       NOT NULL DEFAULT '[]',
  lesson_count       int         NOT NULL DEFAULT 0,
  reward_per_lesson  int         NOT NULL DEFAULT 500,
  total_amount_jpy   int         NOT NULL DEFAULT 0,
  status             text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'skipped', 'failed')),
  stripe_credit_id   text,
  applied_at         timestamptz,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, author_user_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_academy_creator_rewards_period
  ON academy_creator_rewards (period_month DESC);

CREATE INDEX IF NOT EXISTS idx_academy_creator_rewards_author
  ON academy_creator_rewards (author_user_id, period_month DESC);

CREATE INDEX IF NOT EXISTS idx_academy_creator_rewards_status
  ON academy_creator_rewards (status) WHERE status = 'pending';

-- RLS
ALTER TABLE academy_creator_rewards ENABLE ROW LEVEL SECURITY;

-- 著者自身は自分の報酬を閲覧可
CREATE POLICY "rewards_select_own"
  ON academy_creator_rewards FOR SELECT
  USING (auth.uid() = author_user_id);

-- 同テナントの admin+ は自テナント分を閲覧可
CREATE POLICY "rewards_select_tenant_admin"
  ON academy_creator_rewards FOR SELECT
  USING (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM tenant_memberships tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'super_admin')
    )
  );
