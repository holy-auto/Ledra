/**
 * 保険会社向け ZKP 検証 API
 *
 * POST /api/insurer/zkp/verify
 *
 * 保険会社は部品装着コミットメントを検証できる。
 * 顧客の個人情報・シリアル番号・仕入れ価格は一切返さない。
 * Merkle 証明により数学的に「正規部品が装着された」ことを証明する。
 */

import { NextRequest } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiError, apiOk } from "@/lib/api/response";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { verifyZkpClaims } from "@/lib/zkp/verifier";
import type { ZkpClaimKey } from "@/lib/zkp/types";

const ALLOWED_CLAIM_KEYS: ZkpClaimKey[] = [
  "part_category",
  "brand_tier",
  "part_assurance_level",
  "installation_period",
  "quantity_committed",
  "serial_proven",
  "customer_verified",
];

export async function POST(req: NextRequest) {
  const caller = await resolveInsurerCaller();
  if (!caller) {
    return apiError({ code: "unauthorized", message: "認証が必要です", status: 401 });
  }

  const body = await parseJsonSafe(req);
  if (!body) {
    return apiError({ code: "validation_error", message: "リクエストボディが不正です", status: 400 });
  }

  const { commitmentId, claimsToVerify } = body as {
    commitmentId?: string;
    claimsToVerify?: unknown[];
  };

  if (!commitmentId || typeof commitmentId !== "string") {
    return apiError({ code: "validation_error", message: "commitmentId は必須です", status: 400 });
  }

  if (!Array.isArray(claimsToVerify) || claimsToVerify.length === 0) {
    return apiError({ code: "validation_error", message: "claimsToVerify は 1 件以上必要です", status: 400 });
  }

  const invalidKeys = (claimsToVerify as string[]).filter((k) => !ALLOWED_CLAIM_KEYS.includes(k as ZkpClaimKey));
  if (invalidKeys.length > 0) {
    return apiError({
      code: "validation_error",
      message: `不正なクレームキー: ${invalidKeys.join(", ")}`,
      status: 400,
    });
  }

  const result = await verifyZkpClaims({
    commitmentId,
    claimsToVerify: claimsToVerify as ZkpClaimKey[],
    insurerId: caller.insurerId,
  });

  return apiOk({
    result,
    message: result.overallValid ? "ZKP 検証成功: 部品装着が証明されました" : "ZKP 検証失敗または未アンカー",
  });
}
