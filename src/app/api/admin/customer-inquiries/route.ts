import { NextResponse } from "next/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { customerInquiryPatchSchema } from "@/lib/validations/customer-inquiry";

/** GET /api/admin/customer-inquiries — テナントの問い合わせ一覧
 *
 * 既存のカーソル方式 (cursor=<created_at>) は維持しつつ、`per_page`
 * クエリで返却件数を可変にできるようにする。`page` (1-based offset) も
 * 受け付け、page 指定があれば total 件数も返す (UI 側のページ番号
 * 表示用)。 */
export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "all";
    const cursor = url.searchParams.get("cursor");
    const perPage = Math.min(200, Math.max(1, parseInt(url.searchParams.get("per_page") ?? "50", 10) || 50));
    const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10) || 0);

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    let query = admin
      .from("customer_inquiries")
      // phone_last4_hash は server-side の scope 判定にのみ使う内部識別子。
      // 管理画面 UI は表示せず、クライアントに送る必要がない。
      .select(
        "id, customer_name, subject, message, status, admin_reply, replied_at, created_at, ai_category, ai_priority, ai_draft_reply, ai_confidence, ai_classified_at",
        {
          count: page > 0 ? "exact" : undefined,
        },
      )
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (status !== "all") query = query.eq("status", status);
    if (cursor) query = query.lt("created_at", cursor);

    if (page > 0) {
      const from = (page - 1) * perPage;
      query = query.range(from, from + perPage - 1);
    } else {
      query = query.limit(perPage);
    }

    const { data, error, count } = await query;
    if (error) return apiInternalError(error, "admin/customer-inquiries GET");

    return apiJson({
      ok: true,
      inquiries: data ?? [],
      page,
      per_page: perPage,
      total: count ?? null,
    });
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
    if (!requirePermission(caller, "customers:edit")) return apiForbidden();

    const parsed = customerInquiryPatchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, status: newStatus, admin_reply: reply } = parsed.data;

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
    if (newStatus) updates.status = newStatus;
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
