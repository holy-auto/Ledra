/**
 * GET /api/cron/parts-anchor — 確定済み高額/シリアル装着の個別アンカー（cron）。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.5
 */

import type { NextRequest } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { anchorPendingInstallations } from "@/lib/parts/anchorService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  if (process.env.POLYGON_ANCHOR_ENABLED !== "true") {
    return apiJson({ skipped: true, reason: "POLYGON_ANCHOR_ENABLED is not true" });
  }

  try {
    const result = await anchorPendingInstallations();
    return apiJson(result);
  } catch (e) {
    return apiInternalError(e, "cron/parts-anchor");
  }
}
