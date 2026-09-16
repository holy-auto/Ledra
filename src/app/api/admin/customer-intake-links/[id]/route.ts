/**
 * DELETE /api/admin/customer-intake-links/:id
 *
 * 店舗用登録リンクを無効化する (is_active=false). 履歴は残すため物理削除しない.
 */
import { withCaller } from "@/lib/api/withCaller";
import { apiOk, apiInternalError } from "@/lib/api/response";
import { deactivateStoreLink } from "@/lib/identity/intakeLinkServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    const { id } = params;
    try {
      await deactivateStoreLink(caller.tenantId, id);
      return apiOk({ deactivated: true });
    } catch (err) {
      return apiInternalError(err, "DELETE /api/admin/customer-intake-links/[id]");
    }
  },
  { permission: "customers:create", rateLimit: "admin_write", routeName: "customer-intake-links DELETE" },
);
