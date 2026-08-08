import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

/**
 * PUT /api/admin/notifications/read-all
 * 呼び出しユーザーが見られる未読通知 (テナント宛 user_id=null + 本人宛) を一括で既読にする。
 *
 * ベルの「すべて既読」がローカル状態しか更新せず、次のポーリングで未読が復活する不具合の
 * 恒久対処。単一既読ルート (`[id]/read`) と同じく read_at タイムスタンプを立てる。
 */
export async function PUT() {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("tenant_id", caller.tenantId)
      .or(`user_id.is.null,user_id.eq.${caller.userId}`)
      .is("read_at", null);

    if (error) return apiInternalError(error, "mark all notifications read");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "mark all notifications read");
  }
}
