/**
 * ZKP 検証サービス（保険会社向け）
 *
 * 保険会社は commitmentId と検証したいクレームキーを送信する。
 * サーバは以下を検証して結果を返す:
 *   1. Merkle 証明の数学的正当性
 *   2. Merkle ルートが Polygon に記録されているか
 *   3. 各クレームの値を開示（非開示クレームは null のまま）
 *
 * 保険会社は一切の生データ（顧客情報、シリアル番号、価格）を受け取らない。
 */

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { verifyMerklePath, buildMerkleLeaves } from "./merkleTree";
import type { ZkpClaim, ZkpClaimKey, ZkpVerifyResult } from "./types";

/** 保険会社コンテキストからの検証リクエスト */
export interface VerifyInput {
  commitmentId: string;
  claimsToVerify: ZkpClaimKey[];
  /** 保険会社 ID（ログ目的） */
  insurerId: string;
}

/**
 * 指定クレームを Merkle 証明で検証し、開示可能な値を返す。
 * 検証はオフチェーン（Merkle 数学）で実施し、
 * Polygon への記録確認はアンカー済みフラグで判定する。
 */
export async function verifyZkpClaims(input: VerifyInput): Promise<ZkpVerifyResult> {
  const admin = createServiceRoleAdmin("zkpVerifier — read zkp_commitments for insurer verification");

  const { data, error } = await admin
    .from("zkp_commitments")
    .select(
      "id, installation_id, merkle_root, leaf_count, claims_snapshot, polygon_tx_hash, polygon_network, polygon_anchored_at",
    )
    .eq("id", input.commitmentId)
    .maybeSingle();

  if (error || !data) {
    return buildErrorResult(input.commitmentId, input.claimsToVerify, "Commitment not found");
  }

  const claims = data.claims_snapshot as ZkpClaim[];
  const leaves = buildMerkleLeaves(claims);
  const merkleRoot: string = data.merkle_root;

  const verifiedClaims: ZkpVerifyResult["verifiedClaims"] = {} as ZkpVerifyResult["verifiedClaims"];
  let allValid = true;

  for (const key of input.claimsToVerify) {
    const leafIndex = claims.findIndex((c) => c.key === key);

    if (leafIndex === -1) {
      verifiedClaims[key] = { verified: false, value: null, error: "Claim not found in commitment" };
      allValid = false;
      continue;
    }

    const claim = claims[leafIndex];

    // Merkle 証明をサーバ側で生成して検証（保険会社が自前で実装することも可能）
    const { computeMerklePath } = await import("./merkleTree");
    const merklePath = computeMerklePath(leaves, leafIndex);
    const isValid = verifyMerklePath(claim.commitment, merklePath, merkleRoot);

    if (!isValid) {
      verifiedClaims[key] = { verified: false, value: null, error: "Merkle proof invalid" };
      allValid = false;
      continue;
    }

    // 開示可能なクレームのみ値を返す（null = 非開示、検証のみ）
    verifiedClaims[key] = { verified: true, value: claim.value };
  }

  // Polygon 記録確認
  const isAnchored = !!data.polygon_tx_hash;
  if (!isAnchored) allValid = false;

  return {
    commitmentId: data.id,
    installationId: data.installation_id,
    merkleRoot,
    polygonTxHash: data.polygon_tx_hash ?? null,
    polygonAnchoredAt: data.polygon_anchored_at ?? null,
    verifiedClaims,
    overallValid: allValid && isAnchored,
  };
}

function buildErrorResult(commitmentId: string, keys: ZkpClaimKey[], errorMsg: string): ZkpVerifyResult {
  const verifiedClaims = Object.fromEntries(
    keys.map((k) => [k, { verified: false, value: null, error: errorMsg }]),
  ) as ZkpVerifyResult["verifiedClaims"];

  return {
    commitmentId,
    installationId: "",
    merkleRoot: "",
    polygonTxHash: null,
    polygonAnchoredAt: null,
    verifiedClaims,
    overallValid: false,
  };
}
