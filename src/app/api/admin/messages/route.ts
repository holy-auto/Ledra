
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { listMessageThreads } from "@/lib/messages/threads";
import { apiJson, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/messages
 *
 * 横断的な会話受信箱のスレッド一覧。集約ロジックはモバイル版
 * (/api/mobile/messages) と共有するため src/lib/messages/threads.ts にある。
 */
export const GET = withCaller(
  async (req, { caller }) => {
    try {

      const url = new URL(req.url);
      const unreadOnly = url.searchParams.get("unread") === "true";

      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const result = await listMessageThreads(admin, caller.tenantId, { unreadOnly });

      return apiJson(result);
    } catch (e) {
      return apiInternalError(e, "messages list");
    }
  },
  { routeName: "messages list" },
);
