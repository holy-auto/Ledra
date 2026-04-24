import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";

/**
 * GET /api/admin/orders/[id]/messages
 * チャット履歴取得
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    const tenantId = caller.tenantId;

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const cursor = req.nextUrl.searchParams.get("before"); // pagination cursor
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 100);

    // 注文の存在 + 権限チェック
    const { data: order } = await admin
      .from("job_orders")
      .select("id, from_tenant_id, to_tenant_id")
      .eq("id", id)
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .single();

    if (!order) {
      return apiNotFound("not_found");
    }

    let query = admin
      .from("chat_messages")
      .select("id, sender_user_id, sender_tenant_id, body, attachment_path, attachment_type, is_system, created_at")
      .eq("job_order_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data: messages, error } = await query;

    if (error) {
      return apiInternalError(error, "messages fetch");
    }

    return apiJson({
      messages: (messages ?? []).reverse(),
      has_more: (messages ?? []).length === limit,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "messages GET");
  }
}

/**
 * POST /api/admin/orders/[id]/messages
 * チャットメッセージ送信
 * Body: { body: string, attachment_path?: string, attachment_type?: string }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    const tenantId = caller.tenantId;

    const reqBody = await req.json();
    const { body, attachment_path, attachment_type } = reqBody;

    if (!body || typeof body !== "string" || body.trim().length === 0) {
      return apiValidationError("メッセージを入力してください");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 注文取得（from/to テナント情報を冗長保持するため）
    const { data: order } = await admin
      .from("job_orders")
      .select("id, from_tenant_id, to_tenant_id")
      .eq("id", id)
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .single();

    if (!order) {
      return apiNotFound("not_found");
    }

    // 受注者未定（to_tenant_id NULL）の案件ではチャット不可
    if (!order.to_tenant_id) {
      return apiValidationError("受注者が確定するまでメッセージは送れません");
    }

    const { data, error } = await admin
      .from("chat_messages")
      .insert({
        job_order_id: id,
        sender_user_id: caller.userId,
        sender_tenant_id: tenantId,
        from_tenant_id: order.from_tenant_id,
        to_tenant_id: order.to_tenant_id,
        body: body.trim(),
        attachment_path: attachment_path || null,
        attachment_type: attachment_type || null,
        is_system: false,
      })
      .select(
        "id, job_order_id, sender_user_id, sender_tenant_id, body, attachment_path, attachment_type, is_system, created_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "messages insert");
    }

    return apiJson({ message: data }, { status: 201 });
  } catch (e: unknown) {
    return apiInternalError(e, "messages POST");
  }
}
