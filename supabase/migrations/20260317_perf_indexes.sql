-- =============================================================
-- パフォーマンス改善用インデックス追加
-- 大量データ対応: 頻出クエリパターンに合わせたインデックス
-- =============================================================

-- 顧客: メールアドレス検索（外部予約API、重複チェック）
CREATE INDEX IF NOT EXISTS idx_customers_tenant_email
  ON customers(tenant_id, email) WHERE email IS NOT NULL;

-- 顧客: LINE user_id 検索（LINE 連携予約）
CREATE INDEX IF NOT EXISTS idx_customers_tenant_line
  ON customers(tenant_id, line_user_id) WHERE line_user_id IS NOT NULL;

-- 予約: 担当者別（ダブルブッキングチェック用）
CREATE INDEX IF NOT EXISTS idx_reservations_assigned_user
  ON reservations(tenant_id, assigned_user_id, scheduled_date)
  WHERE assigned_user_id IS NOT NULL;

-- 予約: ソース別（外部予約統計用）
CREATE INDEX IF NOT EXISTS idx_reservations_source
  ON reservations(tenant_id, source);

-- 証明書: public_id 検索（公開ステータスAPI、高頻度）
CREATE INDEX IF NOT EXISTS idx_certificates_public_id
  ON certificates(public_id) WHERE public_id IS NOT NULL;

-- 証明書: 車両別（同車両の過去証明書一覧）
CREATE INDEX IF NOT EXISTS idx_certificates_vehicle
  ON certificates(vehicle_id, created_at DESC) WHERE vehicle_id IS NOT NULL;

-- 証明書画像: 証明書別ソート済み
CREATE INDEX IF NOT EXISTS idx_certificate_images_cert_sort
  ON certificate_images(certificate_id, sort_order);

-- NFC タグ: 証明書別
CREATE INDEX IF NOT EXISTS idx_nfc_tags_cert
  ON nfc_tags(certificate_id);

-- 車両履歴: 車両別時系列
CREATE INDEX IF NOT EXISTS idx_vehicle_histories_vehicle
  ON vehicle_histories(vehicle_id, performed_at DESC);

-- 請求書: テナント別作成日
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_created
  ON invoices(tenant_id, created_at DESC);

-- ドキュメント: テナント別作成日
CREATE INDEX IF NOT EXISTS idx_documents_tenant_created
  ON documents(tenant_id, created_at DESC);

-- マーケット車両: テナント別作成日
CREATE INDEX IF NOT EXISTS idx_market_vehicles_tenant_created
  ON market_vehicles(tenant_id, created_at DESC);

-- マーケット問い合わせ: 売主テナント別
CREATE INDEX IF NOT EXISTS idx_market_inquiries_seller
  ON market_inquiries(seller_tenant_id, created_at DESC);

-- マーケット取引: 売主テナント別
CREATE INDEX IF NOT EXISTS idx_market_deals_seller
  ON market_deals(seller_tenant_id, created_at DESC);

-- BtoB 発注: 複合ステータス検索
CREATE INDEX IF NOT EXISTS idx_job_orders_combined
  ON job_orders(status, created_at DESC);
