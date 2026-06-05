-- =============================================================================
-- 証明書レコードアンカリング — Phase 3: Merkle batch テーブル + 配線
--
-- 設計: docs/anchoring-roadmap.md
--
-- 直前の migration (20260605000000) で発行時に certificate_anchors へ digest を
-- queued で積む write-path を入れた。本 migration はそれを日次で Merkle batch に
-- まとめ、LedraBatchAnchor コントラクトへ root 1件を刻む処理パスの DB を用意する。
--
--   - certificate_anchor_batches : Merkle root 単位 (1 root = 1 tx = 多数の証明書)
--   - certificate_anchors.batch_id : 上記への FK (NOT VALID — 既存行スキャン回避)
--   - certificates.latest_anchor_id : 表示・検証 join 用の最新 anchor ショートカット
--
-- Merkle root / tx_hash は PII を含まず、第三者検証のため公開できる。
-- =============================================================================

CREATE TABLE IF NOT EXISTS certificate_anchor_batches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- OpenZeppelin StandardMerkleTree の root (0x + 64 hex)
  merkle_root      text NOT NULL UNIQUE,
  leaf_count       integer NOT NULL,
  contract_address text NOT NULL,
  network          text NOT NULL CHECK (network IN ('polygon', 'amoy')),
  tx_hash          text NOT NULL,
  block_number     bigint,
  anchored_at      timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Merkle root / tx は公開検証の対象 (PII 非保持)。誰でも参照可。
ALTER TABLE certificate_anchor_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS certificate_anchor_batches_select ON certificate_anchor_batches;
CREATE POLICY certificate_anchor_batches_select ON certificate_anchor_batches
  FOR SELECT USING (true);

-- certificate_anchors.batch_id に FK を付与 (前 migration で nullable 列を先置き済み)。
-- NOT VALID: 既存行 (あれば) の検証スキャンを避ける。新規書き込みは引き続き検証される。
ALTER TABLE certificate_anchors DROP CONSTRAINT IF EXISTS certificate_anchors_batch_id_fkey;
ALTER TABLE certificate_anchors
  ADD CONSTRAINT certificate_anchors_batch_id_fkey
  FOREIGN KEY (batch_id) REFERENCES certificate_anchor_batches(id) NOT VALID;

-- 検証 API / 表示で「最新 anchor」を引くためのショートカット。
-- 新規 nullable 列 + inline REFERENCES (全行 NULL のため検証スキャン不要・高速)。
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS latest_anchor_id uuid REFERENCES certificate_anchors(id);
