import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { mobilePushTokenSchema, mobilePushTokenDeleteSchema } from "@/lib/validations/mobile";

export const dynamic = "force-dynamic";

// ─── POST: Register push notification token ───
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const parsed = await parseJsonBody(request, mobilePushTokenSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    // code-review 指摘 (2026-09-09): 共有端末で前のユーザーがサインアウト時に
    // このトークンを解除できていない場合（401経由のサインアウトはセッション
    // 破棄後で認証リクエストが送れず、常に失敗する）、UNIQUE(user_id, token)
    // への upsert は新しい行を作るだけで前ユーザーの行を残す。前ユーザー宛の
    // 通知が同じ端末に届き続けるため、同じ物理トークンを持つ他ユーザーの行を
    // 先に削除して reclaim する。push_tokens の RLS は user_id = auth.uid()
    // のみ許可するため、この削除は service-role で行う（token はユーザーを
    // 跨いだ物理端末の識別子で、テナントもユーザーも異なりうる）。
    const admin = createServiceRoleAdmin("push.register — reclaim a stale token from a previous user on this device");
    const { error: reclaimErr } = await admin
      .from("push_tokens")
      .delete()
      .eq("token", body.token)
      .neq("user_id", caller.userId);
    if (reclaimErr) return apiInternalError(reclaimErr, "push.register: reclaim");

    const { data, error } = await caller.supabase
      .from("push_tokens")
      .upsert(
        {
          user_id: caller.userId,
          tenant_id: caller.tenantId,
          token: body.token,
          platform: body.platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token" },
      )
      .select("id, user_id, tenant_id, token, platform, updated_at")
      .single();

    if (error) return apiInternalError(error, "push.register");

    return apiOk({ push_token: data });
  } catch (e) {
    return apiInternalError(e, "push.register");
  }
}

// ─── DELETE: Remove push token ───
export async function DELETE(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const parsed = await parseJsonBody(request, mobilePushTokenDeleteSchema);
    if (!parsed.ok) return parsed.response;
    const { token } = parsed.data;

    const { error } = await caller.supabase
      .from("push_tokens")
      .delete()
      .eq("user_id", caller.userId)
      .eq("token", token);

    if (error) return apiInternalError(error, "push.unregister");

    return apiOk({ deleted: true });
  } catch (e) {
    return apiInternalError(e, "push.unregister");
  }
}
