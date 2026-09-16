/**
 * GET /api/cron/parts-anchor — 確定済み高額/シリアル装着の個別アンカー（cron）。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.5
 */

import type { NextRequest } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { anchorPendingInstallations, recomputeVehicleMetaAnchors } from "@/lib/parts/anchorService";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  if (process.env.POLYGON_ANCHOR_ENABLED !== "true") {
    return apiJson({ skipped: true, reason: "POLYGON_ANCHOR_ENABLED is not true" });
  }

  try {
    // E3-3 是正 (2026-09-08): 同時多重起動を防ぐロック。無いと同一の確定済み装着行が
    // 2本の cron 実行に同時に拾われ、Polygon への個別/メタ anchor tx がガス代ごと
    // 二重発行され得る。
    const supabase = createServiceRoleAdmin("cron:parts-anchor — parts anchor lock coordination");
    const lock = await withCronLock(supabase, "parts-anchor", 300, async () => {
      // 高額/シリアルの個別アンカー → 車両単位の全件メタアンカー
      const individual = await anchorPendingInstallations();
      const meta = await recomputeVehicleMetaAnchors();
      return { individual, meta };
    });
    if (!lock.acquired) {
      return apiJson({ skipped: true, reason: "lock-held" });
    }
    return apiJson(lock.value);
  } catch (e) {
    return apiInternalError(e, "cron/parts-anchor");
  }
}
