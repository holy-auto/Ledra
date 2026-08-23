import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { parseThreadKey } from "@/lib/messages/threadKey";
import { withAttachmentUrls } from "@/lib/messages/attachments";
import { fetchThreadMessages, markThreadRead, resolveThread } from "@/lib/messages/threads";
import { sendCustomerLineText } from "@/lib/line/client";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * 受信箱の 1 スレッドの取得 / 返信送信 / 既読化（モバイル）。
 *
 * 管理画面版 (/api/admin/messages/[key]) と同じロジックを共有し、
 * 認証だけ Bearer トークンに差し替えたもの。画像送信は管理画面のみ
 * （現場では文字だけ返せれば足りる。必要になったら multipart を足す）。
 */

const sendSchema = z.object({
  body: z.string().trim().min(1, "メッセージを入力してください。").max(2000, "メッセージは 2000 文字以内です。"),
});

export async function GET(request: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const ref = parseThreadKey(key);
    if (ref.kind === "invalid") return apiValidationError("invalid thread key");

    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const resolved = await resolveThread(admin, caller.tenantId, ref);
    if (!resolved) return apiNotFound("thread not found");

    const messages = await withAttachmentUrls(
      await fetchThreadMessages(admin, caller.tenantId, resolved.customerId, resolved.lineUserId, resolved.emailFrom),
    );

    return apiOk({
      thread: {
        key,
        customer_id: resolved.customerId,
        line_user_id: resolved.lineUserId,
        email_from: resolved.emailFrom,
        name: resolved.name,
      },
      messages,
      // 返信送信は LINE のみ (メールは受信取り込み専用)。
      can_send: !!resolved.lineUserId,
    });
  } catch (e) {
    return apiInternalError(e, "mobile message thread GET");
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const ref = parseThreadKey(key);
    if (ref.kind === "invalid") return apiValidationError("invalid thread key");

    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const resolved = await resolveThread(admin, caller.tenantId, ref);
    if (!resolved) return apiNotFound("thread not found");
    if (!resolved.lineUserId) {
      return apiValidationError(
        resolved.emailFrom
          ? "メールスレッドには返信を送信できません（受信取り込み専用です）。"
          : "このスレッドには LINE ユーザがまだ紐付いていません。",
      );
    }

    const parsed = sendSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    // 送信失敗でも履歴には outbound 行が残る (delivered=false)。呼び出し側で警告を出すこと。
    const delivered = await sendCustomerLineText({
      tenantId: caller.tenantId,
      customerId: resolved.customerId,
      lineUserId: resolved.lineUserId,
      body: parsed.data.body,
      sentByUserId: caller.userId,
    });

    return apiOk({ delivered });
  } catch (e) {
    return apiInternalError(e, "mobile message thread POST");
  }
}

/** PATCH — スレッドの inbound 未読を一括既読化する。body 不要。 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const ref = parseThreadKey(key);
    if (ref.kind === "invalid") return apiValidationError("invalid thread key");

    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const resolved = await resolveThread(admin, caller.tenantId, ref);
    if (!resolved) return apiNotFound("thread not found");

    const marked = await markThreadRead(admin, caller.tenantId, resolved);
    return apiOk({ marked_read: marked });
  } catch (e) {
    return apiInternalError(e, "mobile message thread PATCH");
  }
}
