/**
 * ZKP（ゼロ知識証明）型定義
 *
 * 実装方式: Merkle ツリーによる選択的開示（Selective Disclosure）
 *
 * 完全な ZK 回路（Groth16/PLONK）への移行ロードマップ:
 *   Phase 1 (現在): SHA-256 Merkle ツリーによるコミットメント + 選択的開示
 *   Phase 2 (予定): snarkjs/Circom または Noir による真の ZK 回路実装
 *
 * 保険会社が検証できること（プライバシーを守りながら）:
 *   - 部品カテゴリ（OEM ブレーキパッドなど）
 *   - ブランドグレード（OEM / 認定アフターマーケット）
 *   - 装着が完了した事実（タイムスタンプ付き）
 *
 * 保険会社に開示されないもの:
 *   - 顧客の個人情報（氏名、住所）
 *   - 部品シリアル番号（競合情報）
 *   - 仕入れ価格・店舗マージン
 *   - 車台番号（VIN）完全値
 */

export type ZkpClaimKey =
  | "part_category"
  | "brand_tier"
  | "quantity_committed"
  | "installation_period"
  | "part_assurance_level"
  | "serial_proven"
  | "customer_verified";

/** ブランドグレード（開示可能な粒度に限定） */
export type BrandTier = "oem" | "aftermarket_certified" | "aftermarket_generic" | "unknown";

/** 装着期間バケット（月単位で粗粒度化）*/
export type InstallationPeriod = `${number}-${string}`; // "2026-06" 形式

/** 部品保証レベル（保険会社が知る必要のある情報のみ） */
export type PartAssuranceLevel = "customer_otp" | "store_contact_otp" | "any";

/** Merkle ツリーの 1 リーフ = 1 クレーム */
export interface ZkpClaim {
  key: ZkpClaimKey;
  /** 開示する場合は平文値（string）; 非開示の場合は null でコミット済みハッシュのみ */
  value: string | null;
  /** SHA-256(key + "|" + value + "|" + nonce) */
  commitment: string;
}

/** Merkle パスの 1 ノード */
export interface MerklePathNode {
  hash: string;
  position: "left" | "right";
}

/** 選択的開示証明（1 クレームの Merkle 証明） */
export interface SelectiveDisclosureProof {
  claim: ZkpClaim;
  /** Merkle ツリー上のリーフインデックス */
  leafIndex: number;
  /** ルートまでの兄弟ノードリスト（下から順） */
  merklePath: MerklePathNode[];
}

/** ZKP コミットメント（Polygon に記録される） */
export interface ZkpCommitment {
  id: string;
  schemaVersion: "ledra-zkp-v1";
  tenantId: string;
  installationId: string;
  /** Merkle ルートハッシュ（Polygon に記録される値） */
  merkleRoot: string;
  /** クレーム数 */
  leafCount: number;
  /** コミットメント作成時刻（ISO8601） */
  createdAt: string;
  /** Polygon トランザクションハッシュ（アンカー後に設定） */
  polygonTxHash: string | null;
  polygonNetwork: "polygon" | "amoy" | null;
  polygonAnchoredAt: string | null;
}

/** 保険会社向け検証リクエスト */
export interface ZkpVerifyRequest {
  commitmentId: string;
  /** 検証したいクレームキー */
  claimsToVerify: ZkpClaimKey[];
}

/** 保険会社向け検証レスポンス */
export interface ZkpVerifyResult {
  commitmentId: string;
  installationId: string;
  merkleRoot: string;
  polygonTxHash: string | null;
  polygonAnchoredAt: string | null;
  /** 検証結果（クレームキー → 結果） */
  verifiedClaims: Record<
    ZkpClaimKey,
    {
      verified: boolean;
      value: string | null;
      error?: string;
    }
  >;
  overallValid: boolean;
}
