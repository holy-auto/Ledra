/**
 * 証明書レコードアンカリングの公開検証レスポンス整形 (純関数)。
 *
 * `GET /api/cert-verify/[public_id]` が返す JSON を組み立てる。第三者が Ledra の
 * サーバーに依存せず検証できるよう、canonical_json (PII 非保持) ・cert_digest ・
 * merkle_proof ・merkle_root ・tx ・Polygonscan URL を返す。
 *
 * 検証手順 (利用者側):
 *   1. canonical_json から SHA-256 を再計算し cert_digest と一致を確認 (= 内容の同一性)
 *   2. cert_digest を merkle_proof で merkle_root まで辿る (OZ StandardMerkleTree)
 *   3. merkle_root が Polygonscan / コントラクトでアンカー済みか確認 (= 存在時刻)
 */

import { buildExplorerUrl } from "./providers/polygon";

export type AnchorNetwork = "polygon" | "amoy" | null;

export interface RawAnchorRow {
  id: string;
  cert_digest: string;
  schema_version: string | null;
  status: string;
  anchor_route: string;
  canonical_json: unknown;
  batch_id: string | null;
  merkle_proof: unknown;
  instant_tx_hash: string | null;
  polygon_network: string | null;
  block_number: number | null;
  anchored_at: string | null;
  created_at: string | null;
}

export interface RawBatchRow {
  id: string;
  merkle_root: string;
  contract_address: string;
  network: string;
  tx_hash: string;
  block_number: number | null;
  anchored_at: string | null;
}

export interface RawImageRow {
  sha256: string | null;
  polygon_tx_hash: string | null;
  polygon_network: string | null;
  authenticity_grade: string | null;
  created_at: string | null;
}

export interface CertVerifyAnchorDTO {
  cert_digest: string;
  schema_version: string | null;
  status: string;
  anchor_route: string;
  canonical_json: unknown;
  anchored_at: string | null;
  created_at: string | null;
  merkle_root: string | null;
  merkle_proof: string[] | null;
  batch_tx_hash: string | null;
  batch_contract: string | null;
  instant_tx_hash: string | null;
  block_number: number | null;
  network: AnchorNetwork;
  polygonscan_url: string | null;
}

export interface CertVerifyImageAnchorDTO {
  sha256: string;
  tx_hash: string | null;
  network: AnchorNetwork;
  authenticity_grade: string | null;
  polygonscan_url: string | null;
  created_at: string | null;
}

// type alias (interface ではなく) — apiOk が要求する Record<string, unknown> へ
// 代入可能にするため (型エイリアスは暗黙の index signature を持つ)。
export type CertVerifyResponse = {
  public_id: string;
  status: string;
  record_anchoring: {
    /** record anchor が 1 件でもあるか。 */
    present: boolean;
    /** current (= latest) anchor の merkle_root がオンチェーンか。未確認なら null。 */
    on_chain_verified: boolean | null;
    current: CertVerifyAnchorDTO | null;
    history: CertVerifyAnchorDTO[];
  };
  image_anchors: CertVerifyImageAnchorDTO[];
};

function coerceNetwork(value: string | null | undefined): AnchorNetwork {
  return value === "polygon" || value === "amoy" ? value : null;
}

function coerceProof(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === "string");
}

function mapAnchor(row: RawAnchorRow, batchById: Map<string, RawBatchRow>): CertVerifyAnchorDTO {
  const batch = row.batch_id ? (batchById.get(row.batch_id) ?? null) : null;
  const network = batch ? coerceNetwork(batch.network) : coerceNetwork(row.polygon_network);
  const batchTxHash = batch?.tx_hash ?? null;
  // batch route は batch tx、instant route は instant tx を explorer 対象にする。
  const explorerTx = batchTxHash ?? row.instant_tx_hash;
  return {
    cert_digest: row.cert_digest,
    schema_version: row.schema_version,
    status: row.status,
    anchor_route: row.anchor_route,
    canonical_json: row.canonical_json,
    anchored_at: row.anchored_at,
    created_at: row.created_at,
    merkle_root: batch?.merkle_root ?? null,
    merkle_proof: coerceProof(row.merkle_proof),
    batch_tx_hash: batchTxHash,
    batch_contract: batch?.contract_address ?? null,
    instant_tx_hash: row.instant_tx_hash,
    block_number: batch?.block_number ?? row.block_number ?? null,
    network,
    polygonscan_url: buildExplorerUrl(explorerTx, network),
  };
}

/**
 * 検証レスポンスを組み立てる。
 *
 * @param anchors          record anchor 行 (新しい順)。
 * @param batchById        batch_id → batch 行。
 * @param currentAnchorId  certificates.latest_anchor_id (無ければ先頭 = 最新を current にする)。
 * @param onChainVerified  current の merkle_root のオンチェーン確認結果 (未確認は null)。
 */
export function buildCertVerifyResponse(input: {
  publicId: string;
  certStatus: string;
  anchors: RawAnchorRow[];
  batchById: Map<string, RawBatchRow>;
  currentAnchorId: string | null;
  images: RawImageRow[];
  onChainVerified: boolean | null;
}): CertVerifyResponse {
  const { publicId, certStatus, anchors, batchById, currentAnchorId, images, onChainVerified } = input;

  const history = anchors.map((a) => mapAnchor(a, batchById));
  const currentRow = anchors.find((a) => a.id === currentAnchorId) ?? anchors[0] ?? null;
  const current = currentRow ? mapAnchor(currentRow, batchById) : null;

  const imageAnchors: CertVerifyImageAnchorDTO[] = images
    .filter((img): img is RawImageRow & { sha256: string } => typeof img.sha256 === "string" && img.sha256.length > 0)
    .map((img) => {
      const network = coerceNetwork(img.polygon_network);
      return {
        sha256: img.sha256,
        tx_hash: img.polygon_tx_hash,
        network,
        authenticity_grade: img.authenticity_grade,
        polygonscan_url: buildExplorerUrl(img.polygon_tx_hash, network),
        created_at: img.created_at,
      };
    });

  return {
    public_id: publicId,
    status: certStatus,
    record_anchoring: {
      present: anchors.length > 0,
      on_chain_verified: current ? onChainVerified : null,
      current,
      history,
    },
    image_anchors: imageAnchors,
  };
}
