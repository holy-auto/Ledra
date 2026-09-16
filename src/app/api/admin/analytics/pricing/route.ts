/**
 * GET /api/admin/analytics/pricing?window=90d|180d|365d|730d
 *
 * Tenant-scoped pricing-elasticity dashboard data.
 * Manager (admin) or above required.
 */

import { hasMinRole } from "@/lib/auth/roles";
import { apiJson, apiForbidden, apiInternalError } from "@/lib/api/response";

import { getPricingElasticity, type PricingWindow } from "@/lib/analytics/pricing";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

const VALID_WINDOWS: ReadonlySet<PricingWindow> = new Set(["90d", "180d", "365d", "730d"] as const);

function parseWindow(raw: string | null): PricingWindow {
  if (raw && (VALID_WINDOWS as Set<string>).has(raw)) return raw as PricingWindow;
  return "365d";
}

export const GET = withCaller(
  async (req, { caller }) => {
    try {
      if (!hasMinRole(caller.role, "admin")) {
        return apiForbidden("この機能には管理者権限が必要です。");
      }

      const window = parseWindow(new URL(req.url).searchParams.get("window"));
      const result = await getPricingElasticity({ tenantId: caller.tenantId, window });

      return apiJson(result);
    } catch (e) {
      return apiInternalError(e, "admin/analytics/pricing");
    }
  },
  { rateLimit: "general", routeName: "admin/analytics/pricing" },
);
