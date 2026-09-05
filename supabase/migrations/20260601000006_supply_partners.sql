-- 供給パートナー (卸元/メーカー) 基盤 — Phase 0 (データモデル + RLS)。
--
-- 背景 (docs/internal/agency-supplier-integration-plan.md):
--   AI 自動受発注を回すには「API・連絡先・商材カタログ」を誰かが入力する必要がある。
--   商材を持っている卸元/メーカー本人 (= 供給パートナー) に入れてもらう構想。
--
-- 用語の分離 (重要):
--   - agents (紹介代理店)        : 既存。店舗を Ledra に紹介する販売パートナー。
--   - suppliers (店舗ローカル仕入先): 既存。各店が自分用に登録する発注先 (メール発注)。
--   - supply_partners (本ファイル) : 新設。商材を卸す主体。platform スコープ
--                                    (テナント横断)。本人が API・連絡先・カタログを登録。
--
-- 設計の肝:
--   1. supply_partners は platform スコープ (tenant 所有ではない)。複数店舗で共有する。
--   2. API 鍵は **別テーブル supply_partner_credentials** に隔離し、tenant には
--      RLS で一切見せない (鍵の復号・発注実行はサーバ側の service-role が代行)。
--      鍵列は secretBox (AES-256-GCM, *_ciphertext) で暗号化して保存する
--      (平文列は作らない / `src/lib/crypto/secretBox.ts`)。
--   3. status (審査) / agent_id (提携) は service-role (運営) のみが変更できる。
--      パートナー本人は連絡先・API 設定・カタログを自己編集できる (= 要件)。
--   4. 既存 suppliers (店舗ローカル) とは併存。purchase_orders はどちらか一方を持つ
--      (排他は app 層 zod で担保。DB の table-level CHECK は既存行スキャンを避けるため張らない)。
--
-- 壁3 との整合: このファイルは schema のみ。発注の確定・送信 (金額の外向きコミット) は
--   引き続き人の承認を要する (api 化しても送信前ゲートは Phase 2 のロジックで維持)。
--
-- 順序の注意 (agent_portal.sql と同じ): SQL 関数は本体検証 (check_function_bodies) が
--   走り、ポリシー式も参照先テーブルの存在を要求するため、
--   「① 全テーブル作成 → ② helper 関数 → ③ RLS/ポリシー → ④ 既存テーブル拡張」の順で書く。

-- ═══ ① テーブル作成 (RLS/ポリシーはまだ張らない) ═══════════════════════════════

-- ─── supply_partners (供給パートナー本体 / 機密でない情報のみ) ──────────────────
CREATE TABLE IF NOT EXISTS supply_partners (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  -- 連絡先 (発注 API が無い場合のメールフォールバック宛先にもなる)
  contact_email       text,
  contact_phone       text,
  -- 審査ステータス (agents と同じ語彙)。service-role のみ変更可 (下のトリガで保護)。
  status              text NOT NULL DEFAULT 'active_pending_review'
                        CHECK (status IN ('active_pending_review', 'active', 'suspended')),
  -- 「同一会社が紹介代理店も兼ねる」場合のみ紐付け。NULL = 純粋な供給のみ (分離可)。
  -- service-role のみ変更可 (下のトリガで保護)。
  agent_id            uuid REFERENCES agents(id) ON DELETE SET NULL,
  -- パートナーポータルのログイン主体 (Phase 1 でスタッフ対応する際は別テーブル化)
  owner_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- API 連携設定 (機密でない部分のみ。鍵は supply_partner_credentials へ)
  api_endpoint        text,   -- 発注を投げる先 (https のみ: app 層 zod で検証)
  api_auth_type       text NOT NULL DEFAULT 'none'
                        CHECK (api_auth_type IN ('none', 'api_key', 'bearer', 'oauth2')),
  api_config          jsonb,  -- ヘッダ名 / フィールドマッピング等の非機密設定
  integration_status  text NOT NULL DEFAULT 'unconfigured'
                        CHECK (integration_status IN ('unconfigured', 'connected', 'error')),
  last_order_at       timestamptz,
  last_error          text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supply_partners_owner  ON supply_partners(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_supply_partners_status ON supply_partners(status);
CREATE INDEX IF NOT EXISTS idx_supply_partners_agent  ON supply_partners(agent_id) WHERE agent_id IS NOT NULL;

-- ─── supply_partner_credentials (API 鍵を隔離。tenant からは一切見えない) ────────
-- 1 パートナー 1 行。鍵は secretBox (AES-256-GCM) で暗号化した envelope を保存する。
-- 平文列は作らない。復号・発注実行はサーバ側 (service-role) のみが行う。
CREATE TABLE IF NOT EXISTS supply_partner_credentials (
  supply_partner_id     uuid PRIMARY KEY REFERENCES supply_partners(id) ON DELETE CASCADE,
  api_key_ciphertext    text,   -- secretBox envelope: v1.<iv>.<ct>
  api_secret_ciphertext text,   -- secretBox envelope
  rotated_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ─── supply_partner_products (商材カタログ / パートナー本人が入力) ────────────────
CREATE TABLE IF NOT EXISTS supply_partner_products (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_partner_id  uuid NOT NULL REFERENCES supply_partners(id) ON DELETE CASCADE,
  sku                text NOT NULL,      -- 先方品番 (inventory_items.supplier_sku と対応)
  name               text NOT NULL,
  category           text,
  list_price         integer,            -- 標準卸値 (税抜・円)
  currency           text NOT NULL DEFAULT 'JPY',
  stock_status       text,               -- in_stock / low / out 等 (任意)
  lead_time_days     integer,
  is_active          boolean NOT NULL DEFAULT true,
  external_ref       jsonb,              -- 先方システムの商品ID等
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supply_partner_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_spp_partner        ON supply_partner_products(supply_partner_id);
CREATE INDEX IF NOT EXISTS idx_spp_partner_active ON supply_partner_products(supply_partner_id, is_active);

-- ─── tenant_supply_links (店舗 ⇔ 供給パートナー / 分離可の実体) ──────────────────
CREATE TABLE IF NOT EXISTS tenant_supply_links (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supply_partner_id  uuid NOT NULL REFERENCES supply_partners(id) ON DELETE CASCADE,
  is_enabled         boolean NOT NULL DEFAULT true,
  priority           integer NOT NULL DEFAULT 100,  -- 同一商材を複数が扱う場合の優先度
  price_overrides    jsonb,                         -- 店舗別の卸値上書き (sku -> price)
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, supply_partner_id)
);

CREATE INDEX IF NOT EXISTS idx_tsl_tenant  ON tenant_supply_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tsl_partner ON tenant_supply_links(supply_partner_id);

-- ═══ ② helper / guard 関数 (テーブル作成後) ════════════════════════════════════

-- ログイン中ユーザーが owner の supply_partner id 集合。agents の my_agent_ids() 相当。
-- Phase 0 は owner_user_id 直結 (単一 owner)。将来スタッフ対応時にこの関数を差し替える。
CREATE OR REPLACE FUNCTION my_supply_partner_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.supply_partners WHERE owner_user_id = auth.uid();
$$;

-- status / agent_id の保護: service-role (auth.uid() IS NULL) 以外による変更は差し戻す。
-- (審査と提携の確定はプラットフォーム運営のみ。パートナーは他フィールドは編集可。)
CREATE OR REPLACE FUNCTION supply_partners_guard_protected_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status := OLD.status;
    END IF;
    IF NEW.agent_id IS DISTINCT FROM OLD.agent_id THEN
      NEW.agent_id := OLD.agent_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 「このパートナーは active か」を RLS から安全に判定するための SECURITY DEFINER 関数。
--   tenant_supply_links の INSERT ポリシーから使う。ポリシー式の中で
--   supply_partners を直接 SELECT すると、本体テーブルの owner 専用 RLS に阻まれて
--   店舗からは常に 0 件になり提携を作れなくなる (RLS-in-policy 問題)。
--   そこで定義者権限で active 判定だけを返す (= 機密列は一切露出しない)。
CREATE OR REPLACE FUNCTION is_supply_partner_active(p_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supply_partners
    WHERE id = p_id AND status = 'active'
  );
$$;

-- ═══ ③ RLS 有効化 + ポリシー + トリガ ══════════════════════════════════════════

-- ── supply_partners ──────────────────────────────────────────────────────────
ALTER TABLE supply_partners ENABLE ROW LEVEL SECURITY;

-- SELECT (本体テーブル): owner 本人のみ。店舗向けの「提携先さがし」は本体を直接
--   見せず、Phase 1 のサーバ側 API (service-role + 列ホワイトリスト) で公開列だけを返す
--   (notes / last_error / api_config / api_endpoint 等の運営内部・連携内部情報を店舗に漏らさない)。
DROP POLICY IF EXISTS "supply_partners_select" ON supply_partners;
CREATE POLICY "supply_partners_select" ON supply_partners
  FOR SELECT USING (id IN (SELECT my_supply_partner_ids()));

-- INSERT: 認証ユーザーは自分が owner のパートナーを登録できる (必ず審査待ちで作成)。
--   運営 (service-role) は RLS をバイパスするため任意 status で作成可。
DROP POLICY IF EXISTS "supply_partners_insert" ON supply_partners;
CREATE POLICY "supply_partners_insert" ON supply_partners
  FOR INSERT WITH CHECK (
    owner_user_id = auth.uid()
    AND status = 'active_pending_review'
  );

-- UPDATE: owner は自分の行を編集できる (連絡先・API 設定など)。
--   status / agent_id の自己変更は trg_supply_partners_guard が差し戻す。
DROP POLICY IF EXISTS "supply_partners_update" ON supply_partners;
CREATE POLICY "supply_partners_update" ON supply_partners
  FOR UPDATE USING (id IN (SELECT my_supply_partner_ids()))
  WITH CHECK (id IN (SELECT my_supply_partner_ids()));

-- DELETE は RLS で公開しない (運営 service-role のみ)。

DROP TRIGGER IF EXISTS trg_supply_partners_updated_at ON supply_partners;
CREATE TRIGGER trg_supply_partners_updated_at
  BEFORE UPDATE ON supply_partners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_supply_partners_guard ON supply_partners;
CREATE TRIGGER trg_supply_partners_guard
  BEFORE UPDATE ON supply_partners
  FOR EACH ROW EXECUTE FUNCTION supply_partners_guard_protected_cols();

COMMENT ON TABLE supply_partners IS
  '供給パートナー (卸元/メーカー)。platform スコープ。API鍵は supply_partner_credentials に隔離。status/agent_id は運営のみ変更可。';

-- NOTE: 店舗が提携先を探す「ディレクトリ」(active パートナーの公開列のみ) は Phase 1 で
--   サーバ側 API (service-role + 列ホワイトリスト) として実装する。本体テーブルへ店舗向けの
--   広い SELECT ポリシーや公開ビューを足すと、列単位の絞り込み・anon への既定 GRANT 周りで
--   情報露出リスクがあるため Phase 0 では設けない (店舗⇔パートナーの突合は app 層で行う)。

-- ── supply_partner_credentials ───────────────────────────────────────────────
ALTER TABLE supply_partner_credentials ENABLE ROW LEVEL SECURITY;

-- owner (パートナー本人) のみ自分の鍵を読み書きできる。tenant 向けポリシーは作らない
--   (= 店舗からは行が一切見えない)。発注時の復号は service-role が RLS バイパスで行う。
DROP POLICY IF EXISTS "spc_select_owner" ON supply_partner_credentials;
CREATE POLICY "spc_select_owner" ON supply_partner_credentials
  FOR SELECT USING (supply_partner_id IN (SELECT my_supply_partner_ids()));
DROP POLICY IF EXISTS "spc_insert_owner" ON supply_partner_credentials;
CREATE POLICY "spc_insert_owner" ON supply_partner_credentials
  FOR INSERT WITH CHECK (supply_partner_id IN (SELECT my_supply_partner_ids()));
DROP POLICY IF EXISTS "spc_update_owner" ON supply_partner_credentials;
CREATE POLICY "spc_update_owner" ON supply_partner_credentials
  FOR UPDATE USING (supply_partner_id IN (SELECT my_supply_partner_ids()))
  WITH CHECK (supply_partner_id IN (SELECT my_supply_partner_ids()));
DROP POLICY IF EXISTS "spc_delete_owner" ON supply_partner_credentials;
CREATE POLICY "spc_delete_owner" ON supply_partner_credentials
  FOR DELETE USING (supply_partner_id IN (SELECT my_supply_partner_ids()));

DROP TRIGGER IF EXISTS trg_spc_updated_at ON supply_partner_credentials;
CREATE TRIGGER trg_spc_updated_at
  BEFORE UPDATE ON supply_partner_credentials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE supply_partner_credentials IS
  '供給パートナーの API 認証情報。secretBox 暗号化 (*_ciphertext)。tenant 向け RLS なし=店舗は読めない。';

-- ── tenant_supply_links (supply_partner_products のポリシーが参照するので先に張る) ─
ALTER TABLE tenant_supply_links ENABLE ROW LEVEL SECURITY;

-- 店舗: 自テナントの提携を CRUD。提携先は active なパートナーに限定 (INSERT 時)。
DROP POLICY IF EXISTS "tsl_select_tenant" ON tenant_supply_links;
CREATE POLICY "tsl_select_tenant" ON tenant_supply_links
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
DROP POLICY IF EXISTS "tsl_insert_tenant" ON tenant_supply_links;
CREATE POLICY "tsl_insert_tenant" ON tenant_supply_links
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND is_supply_partner_active(supply_partner_id)
  );
DROP POLICY IF EXISTS "tsl_update_tenant" ON tenant_supply_links;
CREATE POLICY "tsl_update_tenant" ON tenant_supply_links
  FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));
DROP POLICY IF EXISTS "tsl_delete_tenant" ON tenant_supply_links;
CREATE POLICY "tsl_delete_tenant" ON tenant_supply_links
  FOR DELETE USING (tenant_id IN (SELECT my_tenant_ids()));

-- パートナー: 自分を提携先にしている店舗の行を閲覧可 (誰が仕入れているか把握)
DROP POLICY IF EXISTS "tsl_select_partner" ON tenant_supply_links;
CREATE POLICY "tsl_select_partner" ON tenant_supply_links
  FOR SELECT USING (supply_partner_id IN (SELECT my_supply_partner_ids()));

DROP TRIGGER IF EXISTS trg_tsl_updated_at ON tenant_supply_links;
CREATE TRIGGER trg_tsl_updated_at
  BEFORE UPDATE ON tenant_supply_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE tenant_supply_links IS
  '店舗⇔供給パートナーの提携。紹介(agents)とは独立=「紹介はA社・仕入はB社」を表現可。';

-- ── supply_partner_products ──────────────────────────────────────────────────
ALTER TABLE supply_partner_products ENABLE ROW LEVEL SECURITY;

-- パートナー本人: 自分のカタログを CRUD
DROP POLICY IF EXISTS "spp_select_partner" ON supply_partner_products;
CREATE POLICY "spp_select_partner" ON supply_partner_products
  FOR SELECT USING (supply_partner_id IN (SELECT my_supply_partner_ids()));
DROP POLICY IF EXISTS "spp_insert_partner" ON supply_partner_products;
CREATE POLICY "spp_insert_partner" ON supply_partner_products
  FOR INSERT WITH CHECK (supply_partner_id IN (SELECT my_supply_partner_ids()));
DROP POLICY IF EXISTS "spp_update_partner" ON supply_partner_products;
CREATE POLICY "spp_update_partner" ON supply_partner_products
  FOR UPDATE USING (supply_partner_id IN (SELECT my_supply_partner_ids()))
  WITH CHECK (supply_partner_id IN (SELECT my_supply_partner_ids()));
DROP POLICY IF EXISTS "spp_delete_partner" ON supply_partner_products;
CREATE POLICY "spp_delete_partner" ON supply_partner_products
  FOR DELETE USING (supply_partner_id IN (SELECT my_supply_partner_ids()));

-- 店舗: 提携済み (tenant_supply_links) かつ有効なパートナーのカタログのみ閲覧可
DROP POLICY IF EXISTS "spp_select_tenant" ON supply_partner_products;
CREATE POLICY "spp_select_tenant" ON supply_partner_products
  FOR SELECT USING (
    is_active = true
    AND supply_partner_id IN (
      SELECT supply_partner_id FROM tenant_supply_links
      WHERE tenant_id IN (SELECT my_tenant_ids()) AND is_enabled = true
    )
  );

DROP TRIGGER IF EXISTS trg_spp_updated_at ON supply_partner_products;
CREATE TRIGGER trg_spp_updated_at
  BEFORE UPDATE ON supply_partner_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE supply_partner_products IS
  '供給パートナーの商材カタログ。パートナー本人が CRUD。店舗は提携済みのみ閲覧。';

-- ═══ ④ 既存テーブル拡張 (列追加のみ。index は CONCURRENTLY が要るため別マイグレーション) ═══

-- inventory_items: カタログへのマッピング列。これが張られた品目だけが将来
--   「API 自動発注」の対象になり得る。既存 suppliers/supplier_sku は併存。
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS supply_partner_product_id uuid REFERENCES supply_partner_products(id) ON DELETE SET NULL;

-- purchase_orders: 供給パートナー発注の搬送メタ。
--   supplier_id (テナントローカル) と supply_partner_id (platform) は排他 (app 層 zod で担保)。
--   transport: メール発注か API 発注か。external_order_id: 先方採番の注文番号。
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS supply_partner_id uuid REFERENCES supply_partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transport         text CHECK (transport IN ('email', 'api')),
  ADD COLUMN IF NOT EXISTS external_order_id text,
  ADD COLUMN IF NOT EXISTS transport_status  text CHECK (transport_status IN ('queued', 'sent', 'acked', 'failed')),
  ADD COLUMN IF NOT EXISTS transport_error   text;


-- ─────────────────────────────────────────────────────────────────────────────
-- 【後から追記】20260601000002 / 20260601000003 が足すはずだった列を、
-- supply_partners / supply_partner_credentials を作ったこの位置で足す。
-- あの2本はファイル名の日付がこのファイルより前で、空 DB ではテーブルがまだ無い
-- （どちらも「前提が無ければ skip」にしてある）。新しいファイルは作らない
-- （out-of-order で db push が止まるため）。どちらも ADD COLUMN IF NOT EXISTS
-- なので本番では no-op。
DO $mig$
BEGIN
  IF to_regclass('public.supply_partner_credentials') IS NOT NULL THEN
    ALTER TABLE public.supply_partner_credentials
      ADD COLUMN IF NOT EXISTS webhook_secret_ciphertext text;

    COMMENT ON COLUMN public.supply_partner_credentials.webhook_secret_ciphertext IS
      '受注確定 Webhook の HMAC 署名検証用シークレット (secretBox 暗号化)。パートナーが生成・保持し、署名に使う。';
  END IF;

  IF to_regclass('public.supply_partners') IS NOT NULL THEN
    ALTER TABLE public.supply_partners
      ADD COLUMN IF NOT EXISTS is_trusted boolean NOT NULL DEFAULT false;

    COMMENT ON COLUMN public.supply_partners.is_trusted IS
      '運営が承認した信頼パートナー。全自動送信(auto-send)の対象になり得る。既定 false。';
  END IF;
END
$mig$;
