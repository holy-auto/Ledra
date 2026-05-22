-- =============================================================
-- passport_referral_leads — 中古車市場連携の lead tracking
--
-- Phase D #1: 中古車店・買取業者が `/api/v1/passport/marketplace-info`
-- で VIN を照会した時点で lead 行を作る。partner が後日
-- 「この車を売った」と報告 (claim) してきたら、その lead を
-- claimed に遷移させ、施工店への紹介手数料を計算する根拠にする。
--
-- フローの例:
--   1. 中古車店 X が VIN ABC123 で /marketplace-info を叩く → lead 作成
--   2. partner が paggort 情報を自社サイトに表示して買い手成約
--   3. partner が POST /referrals/claim { lead_token, sale_amount } で報告
--   4. cron か手動で施工店 (lead に紐づくテナント群) に referral_fee を配分
--
-- (4) は v1 では計算 + 表示のみ。実際の Stripe payout は別 PR。
-- =============================================================

CREATE TABLE IF NOT EXISTS passport_referral_leads (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 照会された VIN (normalized)。passport が存在しない場合も lead は作る
  -- (= partner が興味を持った VIN を把握できる)
  vin_code_normalized    text NOT NULL,

  -- 照会した consumer / API key
  consumer_id            uuid NOT NULL REFERENCES passport_api_consumers (id) ON DELETE CASCADE,
  api_key_id             uuid REFERENCES passport_api_keys (id) ON DELETE SET NULL,

  -- 共有可能な lead トークン。partner はこれを使って claim する。
  -- SHA-256 ハッシュは保管せず、生トークンを保管 (lead 自体は機微度低)。
  lead_token             text NOT NULL UNIQUE,

  -- 関連する施工店 (passport_vehicles の tenant_id 集合のスナップショット)。
  -- claim 時の payout 配分計算に使う。Phase D では計算結果は読み込みのみ。
  attributed_tenant_ids  uuid[] NOT NULL DEFAULT '{}'::uuid[],

  status                 text NOT NULL DEFAULT 'queried'
    CHECK (status IN ('queried', 'claimed', 'rejected', 'expired')),

  -- Claim 時に partner が報告した売却額 (任意)。
  -- 紹介手数料は別フィールド or 計算用にここから derive する。
  sale_amount_jpy        integer,

  -- 計算された紹介手数料総額 (claim 時に算出)
  referral_fee_jpy       integer,

  -- 任意の partner-side reference (partner の listing ID 等)
  partner_reference      text,

  queried_at             timestamptz NOT NULL DEFAULT now(),
  claimed_at             timestamptz,
  expires_at             timestamptz NOT NULL DEFAULT (now() + interval '180 days'),

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE passport_referral_leads IS
  'Phase D #1: 中古車市場 partner からの VIN 照会 → 成約紹介手数料の流れを追跡する lead テーブル。';
COMMENT ON COLUMN passport_referral_leads.attributed_tenant_ids IS
  'lead 生成時点で当該 VIN のパスポートに紐づく施工店 ID 集合。後日の payout 配分の根拠。';

-- Lookup by token (claim 時の最頻アクセスパス)
CREATE UNIQUE INDEX IF NOT EXISTS idx_passport_referral_leads_token
  ON passport_referral_leads (lead_token);

-- consumer ごとのアクティビティ集計
CREATE INDEX IF NOT EXISTS idx_passport_referral_leads_consumer
  ON passport_referral_leads (consumer_id, queried_at DESC);

-- VIN ごとの集計 (テナント側ダッシュボード用)
CREATE INDEX IF NOT EXISTS idx_passport_referral_leads_vin
  ON passport_referral_leads (vin_code_normalized, queried_at DESC);

-- claim 待ちの掃き出し
CREATE INDEX IF NOT EXISTS idx_passport_referral_leads_pending
  ON passport_referral_leads (status, expires_at)
  WHERE status = 'queried';

-- updated_at auto-touch
DROP TRIGGER IF EXISTS trg_passport_referral_leads_touch ON passport_referral_leads;
CREATE TRIGGER trg_passport_referral_leads_touch
  BEFORE UPDATE ON passport_referral_leads
  FOR EACH ROW EXECUTE FUNCTION touch_vehicle_passports_updated_at();

-- -------------------------------------------------------------
-- RLS
-- 全アクセスは service-role 経由 (consumer 認証 + tenant ダッシュボード共に
-- サーバ側ハンドラを通す)。tenant は自分が attributed されている lead のみ
-- 読める。
-- -------------------------------------------------------------
ALTER TABLE passport_referral_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "passport_referral_leads_service_role" ON passport_referral_leads;
CREATE POLICY "passport_referral_leads_service_role"
  ON passport_referral_leads
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- attributed テナントに属するユーザは自分の lead を SELECT 可
DROP POLICY IF EXISTS "passport_referral_leads_tenant_select" ON passport_referral_leads;
CREATE POLICY "passport_referral_leads_tenant_select"
  ON passport_referral_leads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM unnest(attributed_tenant_ids) AS t(tid)
      WHERE t.tid IN (SELECT my_tenant_ids())
    )
  );
