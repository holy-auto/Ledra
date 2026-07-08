import { NextRequest } from "next/server";
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
import { withAttachmentUrls } from "@/lib/messages/attachments";
import { sendLineImageFromForm } from "@/lib/messages/sendImage";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
  body: z.string().trim().min(1, "メッセージを入力してください。").max(2000, "メッセージは 2000 文字以内です。"),
});

/**
 * GET /api/admin/customers/[id]/messages
 *
 * 指定顧客との双方向メッセージスレッドを返す。
 * customer_id でマッチした行に加え、線形に紐付いていないが
 * 同じ line_user_id を共有する inbound (友だち追加直後など) も含めて返す。
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: customerId } = await ctx.params;
    if (!customerId) return apiValidationError("customer id is required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: customer, error: custErr } = await admin
      .from("customers")
      .select("id, name, line_user_id")
      .eq("id", customerId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (custErr) return apiInternalError(custErr, "customer messages: customer fetch");
    if (!customer) return apiNotFound("customer not found");

    // メイン: customer_id 紐付け済みのメッセージ
    const { data: byCustomer, error: msgErr } = await admin
      .from("customer_messages")
      .select(
        "id, customer_id, line_user_id, channel, direction, body, sent_by, delivered_at, failed_at, failure_reason, line_message_id, line_timestamp_ms, created_at, ai_extracted, attachment_path, attachment_content_type",
      )
      .eq("tenant_id", caller.tenantId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (msgErr) return apiInternalError(msgErr, "customer messages: by customer");

    // 補助: 同じ line_user_id を共有するが customer_id が未紐付けの行 (友だち追加直後など)
    let byLineUser: typeof byCustomer = [];
    if (customer.line_user_id) {
      const { data: extras, error: extraErr } = await admin
        .from("customer_messages")
        .select(
          "id, customer_id, line_user_id, channel, direction, body, sent_by, delivered_at, failed_at, failure_reason, line_message_id, line_timestamp_ms, created_at, ai_extracted, attachment_path, attachment_content_type",
        )
        .eq("tenant_id", caller.tenantId)
        .eq("line_user_id", customer.line_user_id)
        .is("customer_id", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (extraErr) return apiInternalError(extraErr, "customer messages: by line user");
      byLineUser = extras ?? [];
    }

    const merged = await withAttachmentUrls(
      [...(byCustomer ?? []), ...byLineUser].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    );

    return apiJson({
      customer: { id: customer.id, name: customer.name, line_user_id: customer.line_user_id ?? null },
      messages: merged,
      can_send: !!customer.line_user_id,
    });
  } catch (e) {
    return apiInternalError(e, "customer messages GET");
  }
}

/**
 * POST /api/admin/customers/[id]/messages
 * Body: { body: string }
 *
 * 顧客へ LINE Push 送信し、customer_messages に outbound として記録する。
 * 顧客に line_user_id が紐付いていない場合は 400。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: customerId } = await ctx.params;
    if (!customerId) return apiValidationError("customer id is required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: customer, error: custErr } = await admin
      .from("customers")
      .select("id, line_user_id")
      .eq("id", customerId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (custErr) return apiInternalError(custErr, "customer messages POST: customer fetch");
    if (!customer) return apiNotFound("customer not found");
    if (!customer.line_user_id) {
      return apiValidationError("この顧客には LINE ユーザがまだ紐付いていません。");
    }

    // multipart は画像送信、JSON はテキスト送信
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const out = await sendLineImageFromForm({
        form: await req.formData(),
        tenantId: caller.tenantId,
        customerId: customer.id,
        lineUserId: customer.line_user_id,
        sentByUserId: caller.userId,
      });
      if (!out.ok) return apiValidationError(out.message);
      return apiJson({ ok: true, delivered: out.delivered });
    }

    const parsed = sendSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const delivered = await sendCustomerLineText({
      tenantId: caller.tenantId,
      customerId: customer.id,
      lineUserId: customer.line_user_id,
      body: parsed.data.body,
      sentByUserId: caller.userId,
    });

    return apiJson({ ok: true, delivered });
  } catch (e) {
    return apiInternalError(e, "customer messages POST");
  }
}
