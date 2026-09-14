import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { listMessageThreads } from "@/lib/messages/threads";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/messages — 会話受信箱のスレッド一覧。
 *
 * 集約は管理画面 (/api/admin/messages) と同じ src/lib/messages/threads.ts。
 * ロール制限は付けない (管理画面の GET と同じく認証のみ)。
 *
 * Supabase 直読みではなく API 経由なのは、1000 件スキャン + JS 集約を端末側で
 * やると転送量が重いため。送信・添付は下の [key] 側でサーバ資格情報が要る。
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const unreadOnly = request.nextUrl.searchParams.get("unread") === "true";
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const result = await listMessageThreads(admin, caller.tenantId, { unreadOnly });

    return apiOk(result as unknown as Record<string, unknown>);
  } catch (e) {
    return apiInternalError(e, "mobile messages list");
  }
}
