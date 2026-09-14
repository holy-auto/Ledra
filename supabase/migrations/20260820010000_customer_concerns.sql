-- IMP-026: 顧客確認フローからの懸念事項(「気になる点を伝える」)
-- 受領サイン・部品確認・板金進捗などの確認ページから顧客が懸念を提起し、
-- 請求/証明書発行をブロックする仕組み。customer_inquiries(一般問い合わせ)とは別系統。

CREATE TABLE IF NOT EXISTS customer_concerns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),

  -- 懸念の発生源
  source_type   TEXT NOT NULL CHECK (source_type IN (
    'delivery_receipt', 'parts_confirmation', 'body_repair_consent', 'body_repair_tracking'
  )),
  source_token  TEXT NOT NULL,  -- 署名付き URL トークン(確認ページの特定に使用)

  -- 関連エンティティ(ブロック判定に使用)
  job_id        UUID REFERENCES reservations(id),
  certificate_id UUID REFERENCES certificates(id),

  -- 顧客情報(未認証ページから送信されるためセッション不要)
  customer_name TEXT,
  customer_email TEXT,

  -- 懸念内容
  concern_text  TEXT NOT NULL CHECK (char_length(concern_text) BETWEEN 1 AND 2000),
  category      TEXT CHECK (category IN (
    'work_quality', 'wrong_parts', 'pricing', 'damage', 'other'
  )),

  -- ステータス管理
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  admin_response TEXT,
  resolved_by   UUID REFERENCES auth.users(id),
  resolved_at   TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 管理者がジョブ/証明書ごとに未解決の懸念を高速検索するためのインデックス
CREATE INDEX idx_customer_concerns_job ON customer_concerns (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_customer_concerns_cert ON customer_concerns (certificate_id) WHERE certificate_id IS NOT NULL;
CREATE INDEX idx_customer_concerns_tenant_status ON customer_concerns (tenant_id, status);
CREATE INDEX idx_customer_concerns_source ON customer_concerns (source_token);

-- updated_at 自動更新トリガー(既存の汎用関数を使用)
CREATE TRIGGER trg_customer_concerns_updated_at
  BEFORE UPDATE ON customer_concerns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE customer_concerns ENABLE ROW LEVEL SECURITY;

-- INSERT は API route が service_role で行う(RLS バイパス)。
-- anon/authenticated への INSERT ポリシーは意図的に設けない。
-- PostgREST 経由の直接 INSERT を防ぎ、source_token 検証を強制する。

-- 管理者(テナント内)が閲覧・更新できる
CREATE POLICY customer_concerns_admin_select ON customer_concerns
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.my_tenant_ids()));

CREATE POLICY customer_concerns_admin_update ON customer_concerns
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT public.my_tenant_ids()));

-- service_role は全操作可能(暗黙)
