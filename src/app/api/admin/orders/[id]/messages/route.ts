import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/orders/[id]/messages
 * チャット履歴取得
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantId = caller.tenantId;

    const admin = getSupabaseAdmin();
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
      return NextResponse.json({ error: "not_found" }, { status: 404 });
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
      console.error("[messages] fetch failed:", error.message);
      return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    }

    return NextResponse.json({
      messages: (messages ?? []).reverse(),
      has_more: (messages ?? []).length === limit,
    });
  } catch (e: unknown) {
    console.error("[messages] GET failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/orders/[id]/messages
 * チャットメッセージ送信
 * Body: { body: string, attachment_path?: string, attachment_type?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantId = caller.tenantId;

    const reqBody = await req.json();
    const { body, attachment_path, attachment_type } = reqBody;

    if (!body || typeof body !== "string" || body.trim().length === 0) {
      return NextResponse.json({ error: "メッセージを入力してください" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // 注文取得（from/to テナント情報を冗長保持するため）
    const { data: order } = await admin
      .from("job_orders")
      .select("id, from_tenant_id, to_tenant_id")
      .eq("id", id)
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .single();

    if (!order) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
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
      .select()
      .single();

    if (error) {
      console.error("[messages] insert failed:", error.message);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    return NextResponse.json({ message: data }, { status: 201 });
  } catch (e: unknown) {
    console.error("[messages] POST failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
