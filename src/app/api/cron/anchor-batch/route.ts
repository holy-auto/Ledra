/**
 * GET /api/cron/anchor-batch — 証明書レコードの Merkle batch アンカー (cron)。
 *
 * 設計: docs/anchoring-roadmap.md
 *
 * certificate_anchors の queued 行を 1 つの Merkle root にまとめ LedraBatchAnchor へ刻む。
 * 03:10 JST 日次 (vercel.json)。POLYGON_ANCHOR_ENABLED / CERT_RECORD_ANCHOR_ENABLED の
 * 両方が "true" のときだけ走る。
 */

import type { NextRequest } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { runCertificateAnchorBatch } from "@/lib/anchoring/certificateBatchAnchor";

export const dynamic = "force-dynamic";
// Merkle 構築 + tx confirm 待ちで時間がかかり得るため上限を伸ばす。
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  if (process.env.POLYGON_ANCHOR_ENABLED !== "true") {
    return apiJson({ skipped: true, reason: "POLYGON_ANCHOR_ENABLED is not true" });
  }
  if (process.env.CERT_RECORD_ANCHOR_ENABLED !== "true") {
    return apiJson({ skipped: true, reason: "CERT_RECORD_ANCHOR_ENABLED is not true" });
  }

  try {
    const result = await runCertificateAnchorBatch();
    return apiJson(result);
  } catch (e) {
    return apiInternalError(e, "cron/anchor-batch");
  }
}
