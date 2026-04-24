import { NextResponse } from "next/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

/** GET /api/admin/customer-inquiries — テナントの問い合わせ一覧 */
export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "all";
    const cursor = searchParams.get("cursor");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    let query = admin
      .from("customer_inquiries")
      // phone_last4_hash は server-side の scope 判定にのみ使う内部識別子。
      // 管理画面 UI は表示せず、クライアントに送る必要がない。
      .select("id, customer_name, subject, message, status, admin_reply, replied_at, created_at")
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (status !== "all") query = query.eq("status", status);
    if (cursor) query = query.lt("created_at", cursor);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "admin/customer-inquiries GET");

    return apiJson({ ok: true, inquiries: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "admin/customer-inquiries GET");
  }
}

/** PATCH /api/admin/customer-inquiries — ステータス更新 / 返信 */
export async function PATCH(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const id = (body?.id ?? "").trim();
    const newStatus = body?.status;
    const reply = typeof body?.admin_reply === "string" ? body.admin_reply.trim() : undefined;

    if (!id) return apiValidationError("missing id");

    // 所属テナントの問い合わせのみ更新可
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: existing } = await admin
      .from("customer_inquiries")
      .select("id, tenant_id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!existing) return apiValidationError("not found");

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (newStatus && ["new", "read", "replied"].includes(newStatus)) updates.status = newStatus;
    if (reply !== undefined) {
      updates.admin_reply = reply;
      updates.status = "replied";
      updates.replied_at = new Date().toISOString();
      updates.replied_by = caller.userId;
    }

    const { data, error } = await admin
      .from("customer_inquiries")
      .update(updates)
      .eq("id", id)
      .select("id, status, admin_reply, replied_at")
      .single();

    if (error) return apiInternalError(error, "admin/customer-inquiries PATCH");

    return apiJson({ ok: true, inquiry: data });
  } catch (e) {
    return apiInternalError(e, "admin/customer-inquiries PATCH");
  }
}
