/**
 * POST /api/admin/accounting/{provider}/sync
 * 加盟店の手動同期トリガー。UI の「今すぐ同期」ボタンから呼ばれる。
 */

import { apiOk, apiNotFound, apiInternalError, apiError } from "@/lib/api/response";
import { isAccountingProvider } from "@/lib/accounting/registry";
import { syncTenantToProvider, reasonLabel } from "@/lib/accounting/sync";

import { withCaller } from "@/lib/api/withCaller";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withCaller<{ provider: string }>(
  async (_req, { caller, params }) => {
    try {
      const { provider } = params;
      if (!isAccountingProvider(provider)) return apiNotFound("Unknown accounting provider");

      // 加盟店の連打防止 (admin_write preset = 60 req / 60 s per IP)

      const result = await syncTenantToProvider({
        tenantId: caller.tenantId,
        provider,
        triggerType: "manual",
        triggeredBy: caller.userId,
      });

      if (result.reason) {
        return apiError({
          code: "validation_error",
          message: reasonLabel(result.reason),
          status: 400,
          data: { reason: result.reason },
        });
      }

      return apiOk({
        attempted: result.attempted,
        synced: result.synced,
        failed: result.failed,
        skipped: result.skipped,
        errors: result.errors.slice(0, 10),
      });
    } catch (e) {
      return apiInternalError(e, "accounting manual sync");
    }
  },
  { rateLimit: "admin_write", minRole: "admin", routeName: "accounting manual sync" },
);
