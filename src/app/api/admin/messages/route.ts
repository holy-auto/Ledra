import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { listMessageThreads } from "@/lib/messages/threads";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/messages
 *
 * 横断的な会話受信箱のスレッド一覧。集約ロジックはモバイル版
 * (/api/mobile/messages) と共有するため src/lib/messages/threads.ts にある。
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "true";

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const result = await listMessageThreads(admin, caller.tenantId, { unreadOnly });

    return apiJson(result);
  } catch (e) {
    return apiInternalError(e, "messages list");
  }
}
