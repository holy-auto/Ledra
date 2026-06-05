-- =============================================================================
-- 証明書レコード（メタデータ）アンカリング — Phase 2/3 write-path: queue テーブル
--
-- 設計: docs/anchoring-roadmap.md
--
-- 現状の画像バイト列アンカー (certificate_images.polygon_tx_hash) は「写真あり」
-- 証明書しか保証できない。写真ゼロで発行された証明書や、証明書メタデータ
-- (発行日・施工内容・有効期限) の改ざんはオンチェーンに痕跡が残らない。
--
-- このテーブルは証明書の canonical digest (PII 除外・docs/anchoring-roadmap.md の
-- ledra-cert-v1 仕様) を発行時に status='queued' で積むための追記テーブル。
-- 実際の Merkle batch 送信 / instant 送信 (LedraBatchAnchor / LedraCertAnchor) と
-- 検証 API (/api/cert-verify) は後続スライスで実装する。
--
-- このスライスでは write-path (enqueue) のみ。batch_id の FK と
-- certificate_anchor_batches テーブルは batch-cron スライスで追加する
-- (今は nullable な参照先なしカラムとして用意し、列追加のマイグレーション churn を避ける)。
--
-- 書き込みは service-role / cron のみ (enqueue は createTenantScopedAdmin 経由)。
-- 参照はテナント本人のみ (RLS SELECT)。canonical_json は PII を含まない。
-- =============================================================================

CREATE TABLE IF NOT EXISTS certificate_anchors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  certificate_id  uuid NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  -- 64桁 hex の SHA-256 (canonical certificate digest)
  cert_digest     text NOT NULL,
  -- 検証用に canonical 表現を丸ごと保存 (PII は含まない / ledra-cert-v1)
  canonical_json  jsonb NOT NULL,
  schema_version  text NOT NULL DEFAULT 'ledra-cert-v1',
  status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'batched', 'anchored', 'failed')),
  anchor_route    text NOT NULL DEFAULT 'batch'
                    CHECK (anchor_route IN ('batch', 'instant')),
  -- batch-cron スライスで certificate_anchor_batches(id) への FK を付与する
  batch_id        uuid,
  merkle_proof    jsonb,
  instant_tx_hash text,
  polygon_network text CHECK (polygon_network IS NULL OR polygon_network IN ('polygon', 'amoy')),
  block_number    bigint,
  failure_reason  text,
  retry_count     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  anchored_at     timestamptz
);

-- 証明書ごとの最新 anchor 取得 (dedup / 履歴表示)
CREATE INDEX IF NOT EXISTS idx_certificate_anchors_cert_created
  ON certificate_anchors (certificate_id, created_at DESC);

-- digest からの逆引き (検証 API)
CREATE INDEX IF NOT EXISTS idx_certificate_anchors_digest
  ON certificate_anchors (cert_digest);

-- batch-cron が拾う未処理 queue (部分 index)
CREATE INDEX IF NOT EXISTS idx_certificate_anchors_queued
  ON certificate_anchors (created_at)
  WHERE status = 'queued' AND anchor_route = 'batch';

-- テナントスコープの参照
CREATE INDEX IF NOT EXISTS idx_certificate_anchors_tenant
  ON certificate_anchors (tenant_id);

ALTER TABLE certificate_anchors ENABLE ROW LEVEL SECURITY;

-- 参照のみ (書き込みは cron / service-role 経由)。
DROP POLICY IF EXISTS certificate_anchors_select ON certificate_anchors;
CREATE POLICY certificate_anchors_select ON certificate_anchors
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
