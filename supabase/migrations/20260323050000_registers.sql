-- レジ端末
CREATE TABLE IF NOT EXISTS registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,            -- 例: "レジ1", "モバイルPOS"
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_registers_tenant ON registers(tenant_id);
CREATE INDEX idx_registers_store ON registers(store_id);

-- レジセッション（開閉記録）
CREATE TABLE IF NOT EXISTS register_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  register_id uuid NOT NULL REFERENCES registers(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_cash integer NOT NULL DEFAULT 0,  -- 開始時の釣銭準備金
  closing_cash integer,                      -- 終了時の現金残高
  expected_cash integer,                     -- システム計算の期待現金残高
  cash_difference integer,                   -- 過不足
  total_sales integer DEFAULT 0,            -- セッション内の売上合計
  total_transactions integer DEFAULT 0,     -- セッション内の取引数
  note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rsessions_tenant ON register_sessions(tenant_id);
CREATE INDEX idx_rsessions_register ON register_sessions(register_id);
CREATE INDEX idx_rsessions_status ON register_sessions(tenant_id, status);
CREATE INDEX idx_rsessions_opened ON register_sessions(tenant_id, opened_at);

-- payments テーブルに register_session_id のFK追加（payments作成後に実行されるため IF EXISTS）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'fk_payments_register_session') THEN
      ALTER TABLE payments
        ADD CONSTRAINT fk_payments_register_session
        FOREIGN KEY (register_session_id) REFERENCES register_sessions(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- RLS
ALTER TABLE registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE register_sessions ENABLE ROW LEVEL SECURITY;

-- registers: SELECT=全員、INSERT/UPDATE/DELETE=admin+owner
CREATE POLICY registers_select_v2 ON registers
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY registers_insert_v2 ON registers
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );
CREATE POLICY registers_update_v2 ON registers
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );
CREATE POLICY registers_delete_v2 ON registers
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

-- register_sessions: SELECT=全員、INSERT/UPDATE=staff以上、DELETE=admin+owner
CREATE POLICY rsessions_select_v2 ON register_sessions
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY rsessions_insert_v2 ON register_sessions
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin', 'staff')
  );
CREATE POLICY rsessions_update_v2 ON register_sessions
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin', 'staff')
  );
CREATE POLICY rsessions_delete_v2 ON register_sessions
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

-- updated_at トリガー
CREATE TRIGGER trg_registers_updated_at
  BEFORE UPDATE ON registers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_rsessions_updated_at
  BEFORE UPDATE ON register_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
