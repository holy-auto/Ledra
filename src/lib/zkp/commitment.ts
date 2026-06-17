/**
 * ZKP コミットメント生成サービス
 *
 * 部品装着完了時に呼び出され、以下を実行:
 * 1. 部品情報からクレームを生成（プライバシー保護済み）
 * 2. Merkle ツリーを構築してルートを計算
 * 3. ルートを Polygon にアンカー
 * 4. コミットメントを DB に保存
 *
 * 保険会社は後から保険金請求時に特定クレームの選択的開示を要求できる。
 */

import { randomUUID } from "crypto";
import crypto from "crypto";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { anchorToPolygon } from "@/lib/anchoring/providers/polygon";
import { computeClaimLeaf, computeMerkleRoot, buildMerkleLeaves, computeMerklePath } from "./merkleTree";
import type {
  ZkpClaim,
  ZkpClaim as Claim,
  ZkpCommitment,
  ZkpClaimKey,
  BrandTier,
  InstallationPeriod,
  PartAssuranceLevel,
  SelectiveDisclosureProof,
} from "./types";

const SCHEMA_VERSION = "ledra-zkp-v1" as const;

/** ZKP クレームの nonce ソルト（環境変数） */
function getClaimSalt(): string {
  const salt = process.env.ZKP_CLAIM_SALT;
  if (!salt) throw new Error("Missing ZKP_CLAIM_SALT environment variable");
  return salt;
}

/** プライベート値から nonce を導出（決定的・シークレット依存） */
function deriveNonce(commitmentId: string, claimKey: ZkpClaimKey, secret: string): string {
  return crypto
    .createHmac("sha256", getClaimSalt())
    .update(`${commitmentId}:${claimKey}:${secret}`, "utf8")
    .digest("hex");
}

export interface CommitmentInput {
  tenantId: string;
  installationId: string;
  /** 部品カテゴリ（例: "brake_pad_oem", "coating_ppf"） */
  partCategory: string;
  brandTier: BrandTier;
  quantity: number;
  /** 装着完了時刻 */
  installedAt: string;
  /** 保証レベル */
  assuranceLevel: PartAssuranceLevel;
  /** シリアルフィンガープリント（生シリアルは不要） */
  serialFingerprint: string | null;
  /** 顧客 OTP 検証済みか */
  customerVerified: boolean;
}

/** 月単位バケット（粗粒度化）*/
function toInstallationPeriod(isoDate: string): InstallationPeriod {
  const d = new Date(isoDate);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}` as InstallationPeriod;
}

/** クレームを構築（プライバシー保護済み） */
function buildClaims(commitmentId: string, input: CommitmentInput): ZkpClaim[] {
  const claims: Array<{ key: ZkpClaimKey; plainValue: string; disclosed: boolean }> = [
    // 開示可能クレーム（保険会社が必要とする情報）
    { key: "part_category", plainValue: input.partCategory, disclosed: true },
    { key: "brand_tier", plainValue: input.brandTier, disclosed: true },
    { key: "part_assurance_level", plainValue: input.assuranceLevel, disclosed: true },
    // 粗粒度化された開示可能クレーム
    { key: "installation_period", plainValue: toInstallationPeriod(input.installedAt), disclosed: true },
    // コミット済み（非開示）クレーム
    { key: "quantity_committed", plainValue: String(input.quantity), disclosed: false },
    { key: "serial_proven", plainValue: input.serialFingerprint ?? "none", disclosed: false },
    { key: "customer_verified", plainValue: String(input.customerVerified), disclosed: false },
  ];

  return claims.map(({ key, plainValue, disclosed }) => {
    const nonce = deriveNonce(commitmentId, key, plainValue);
    const commitment = computeClaimLeaf(key, plainValue, nonce);
    return {
      key,
      value: disclosed ? plainValue : null,
      commitment,
    };
  });
}

/** ZKP コミットメントを作成してアンカーする */
export async function createZkpCommitment(input: CommitmentInput): Promise<ZkpCommitment> {
  const { admin } = createTenantScopedAdmin(input.tenantId);
  const commitmentId = randomUUID();
  const createdAt = new Date().toISOString();

  const claims = buildClaims(commitmentId, input);
  const leaves = buildMerkleLeaves(claims);
  const merkleRoot = computeMerkleRoot(leaves);

  // DB にコミットメントを保存（アンカー前）
  const { error: insertErr } = await admin.from("zkp_commitments").insert({
    id: commitmentId,
    schema_version: SCHEMA_VERSION,
    tenant_id: input.tenantId,
    installation_id: input.installationId,
    merkle_root: merkleRoot,
    leaf_count: leaves.length,
    claims_snapshot: claims,
    created_at: createdAt,
    polygon_tx_hash: null,
    polygon_network: null,
    polygon_anchored_at: null,
  });
  if (insertErr) throw new Error(`zkp_commitments insert failed: ${insertErr.message}`);

  // Polygon にアンカー（失敗しても commitmentId は返す）
  const anchorResult = await anchorToPolygon(merkleRoot).catch(() => ({
    txHash: null,
    anchored: false,
    network: null,
  }));

  if (anchorResult.anchored && anchorResult.txHash) {
    await admin
      .from("zkp_commitments")
      .update({
        polygon_tx_hash: anchorResult.txHash,
        polygon_network: anchorResult.network,
        polygon_anchored_at: new Date().toISOString(),
      })
      .eq("id", commitmentId);
  }

  return {
    id: commitmentId,
    schemaVersion: SCHEMA_VERSION,
    tenantId: input.tenantId,
    installationId: input.installationId,
    merkleRoot,
    leafCount: leaves.length,
    createdAt,
    polygonTxHash: anchorResult.txHash,
    polygonNetwork: anchorResult.network,
    polygonAnchoredAt: anchorResult.anchored ? new Date().toISOString() : null,
  };
}

/** 特定クレームの選択的開示証明を生成（shop 側） */
export async function generateSelectiveDisclosureProof(
  tenantId: string,
  commitmentId: string,
  claimKey: ZkpClaimKey,
): Promise<SelectiveDisclosureProof> {
  const { admin } = createTenantScopedAdmin(tenantId);

  const { data, error } = await admin
    .from("zkp_commitments")
    .select("claims_snapshot, merkle_root, leaf_count, tenant_id")
    .eq("id", commitmentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data) throw new Error("Commitment not found");

  const claims = data.claims_snapshot as Claim[];
  const leafIndex = claims.findIndex((c) => c.key === claimKey);
  if (leafIndex === -1) throw new Error(`Claim '${claimKey}' not found in commitment`);

  const leaves = buildMerkleLeaves(claims);
  const merklePath = computeMerklePath(leaves, leafIndex);

  return {
    claim: claims[leafIndex],
    leafIndex,
    merklePath,
  };
}
