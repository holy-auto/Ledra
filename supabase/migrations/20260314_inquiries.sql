-- ============================================================
-- 問い合わせ・商談機能 マイグレーション
-- ============================================================

-- 問い合わせテーブル
CREATE TABLE market_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES market_vehicles(id) ON DELETE CASCADE,
  seller_tenant_id uuid NOT NULL REFERENCES tenants(id),
  buyer_tenant_id uuid REFERENCES tenants(id),
  buyer_name text NOT NULL,
  buyer_company text,
  buyer_email text NOT NULL,
  buyer_phone text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','responded','in_negotiation','closed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_market_inquiries_seller ON market_inquiries(seller_tenant_id);
CREATE INDEX idx_market_inquiries_vehicle ON market_inquiries(vehicle_id);
CREATE INDEX idx_market_inquiries_status ON market_inquiries(status);

ALTER TABLE market_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seller can view own inquiries" ON market_inquiries
  FOR SELECT USING (
    seller_tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "anyone can create inquiry" ON market_inquiries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "seller can update own inquiries" ON market_inquiries
  FOR UPDATE USING (
    seller_tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

-- 問い合わせメッセージ（スレッド形式）
CREATE TABLE market_inquiry_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES market_inquiries(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('buyer','seller')),
  sender_tenant_id uuid REFERENCES tenants(id),
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_inquiry_messages_inquiry ON market_inquiry_messages(inquiry_id);

ALTER TABLE market_inquiry_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants can view messages" ON market_inquiry_messages
  FOR SELECT USING (
    inquiry_id IN (
      SELECT id FROM market_inquiries
      WHERE seller_tenant_id IN (
        SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "anyone can create messages" ON market_inquiry_messages
  FOR INSERT WITH CHECK (true);

-- 商談テーブル
CREATE TABLE market_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid REFERENCES market_inquiries(id),
  vehicle_id uuid NOT NULL REFERENCES market_vehicles(id),
  seller_tenant_id uuid NOT NULL REFERENCES tenants(id),
  buyer_tenant_id uuid REFERENCES tenants(id),
  buyer_name text NOT NULL,
  buyer_company text,
  buyer_email text NOT NULL,
  agreed_price integer,
  status text NOT NULL DEFAULT 'negotiating'
    CHECK (status IN ('negotiating','agreed','completed','cancelled')),
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_market_deals_seller ON market_deals(seller_tenant_id);
CREATE INDEX idx_market_deals_vehicle ON market_deals(vehicle_id);
CREATE INDEX idx_market_deals_status ON market_deals(status);

ALTER TABLE market_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seller can view own deals" ON market_deals
  FOR SELECT USING (
    seller_tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "seller can manage own deals" ON market_deals
  FOR ALL USING (
    seller_tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );
