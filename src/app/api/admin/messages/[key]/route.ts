import { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { sendCustomerLineText } from "@/lib/line/client";
import { maybeCaptureKnowledgeFromReply } from "@/lib/ai/automation/knowledgeCaptureAuto";
import { parseThreadKey } from "@/lib/messages/threadKey";
import { withAttachmentUrls } from "@/lib/messages/attachments";
import { sendLineImageFromForm } from "@/lib/messages/sendImage";
import { fetchThreadMessages, markThreadRead, resolveThread } from "@/lib/messages/threads";

export const dynamic = "force-dynamic";

/**
 * 受信箱の 1 スレッド (会話) の取得 / 返信送信。
 *
 * thread key は受信箱一覧 (`/api/admin/messages`) が返す形:
 *   - "c:<customerId>"  customer に紐付いたスレッド
 *   - "l:<lineUserId>"  まだ customer 未紐付け (友だち追加直後など)
 *   - "e:<emailFrom>"   メール受信の未紐付けスレッド (返信不可)
 *
 * 解決・取得・既読化のロジックはモバイル版 (/api/mobile/messages/[key]) と
 * 共有するため src/lib/messages/threads.ts にある。
 */

const sendSchema = z.object({
  body: z.string().trim().min(1, "メッセージを入力してください。").max(2000, "メッセージは 2000 文字以内です。"),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const ref = parseThreadKey(key);
    if (ref.kind === "invalid") return apiValidationError("invalid thread key");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const resolved = await resolveThread(admin, caller.tenantId, ref);
    if (!resolved) return apiNotFound("thread not found");

    const messages = await withAttachmentUrls(
      await fetchThreadMessages(admin, caller.tenantId, resolved.customerId, resolved.lineUserId, resolved.emailFrom),
    );

    return apiJson({
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
    return apiInternalError(e, "message thread GET");
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const ref = parseThreadKey(key);
    if (ref.kind === "invalid") return apiValidationError("invalid thread key");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
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

    // multipart は画像送信、JSON はテキスト送信
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const out = await sendLineImageFromForm({
        form: await req.formData(),
        tenantId: caller.tenantId,
        customerId: resolved.customerId,
        lineUserId: resolved.lineUserId,
        sentByUserId: caller.userId,
      });
      if (!out.ok) return apiValidationError(out.message);
      return apiJson({ ok: true, delivered: out.delivered });
    }

    const parsed = sendSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const delivered = await sendCustomerLineText({
      tenantId: caller.tenantId,
      customerId: resolved.customerId,
      lineUserId: resolved.lineUserId,
      body: parsed.data.body,
      sentByUserId: caller.userId,
    });

    // 配信できた返信からナレッジ候補を学習する (opt-in / レビュー承認制 / 内部で fail-soft)。
    // 応答をブロックしないよう after() で実行 (未対応テナントは即 return される)。
    if (delivered) {
      after(() =>
        maybeCaptureKnowledgeFromReply({
          tenantId: caller.tenantId,
          customerId: resolved.customerId,
          lineUserId: resolved.lineUserId,
          staffReplyBody: parsed.data.body,
          sentByUserId: caller.userId,
          planTier: caller.planTier,
        }),
      );
    }

    return apiJson({ ok: true, delivered });
  } catch (e) {
    return apiInternalError(e, "message thread POST");
  }
}

/**
 * PATCH /api/admin/messages/[key] — スレッドの inbound 未読を一括既読化する。
 * body 不要。スタッフがスレッドを開いた時点でクライアントから呼ぶ。
 */
export async function PATCH(_req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const ref = parseThreadKey(key);
    if (ref.kind === "invalid") return apiValidationError("invalid thread key");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const resolved = await resolveThread(admin, caller.tenantId, ref);
    if (!resolved) return apiNotFound("thread not found");

    const marked = await markThreadRead(admin, caller.tenantId, resolved);
    return apiJson({ ok: true, marked_read: marked });
  } catch (e) {
    return apiInternalError(e, "message thread PATCH");
  }
}
