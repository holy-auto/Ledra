import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";

export const runtime = "nodejs";

/**
 * GET /api/admin/insurers?status=active_pending_review
 * 全保険会社一覧（管理者専用）
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requirePermission(caller, "insurers:view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") ?? "";

  const admin = createAdminClient();
  let query = admin
    .from("insurers")
    .select("id, name, slug, is_active, status, plan_tier, requested_plan, contact_person, contact_email, contact_phone, signup_source, created_at, updated_at, reviewed_at, activated_at")
    .order("created_at", { ascending: false });

  if (statusFilter && ["active_pending_review", "active", "suspended"].includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ insurers: data ?? [] });
}

/**
 * PATCH /api/admin/insurers
 * 保険会社のステータス・プラン更新（管理者専用）
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requirePermission(caller, "insurers:manage")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { insurer_id, status, plan_tier } = body;

  if (!insurer_id) {
    return NextResponse.json({ error: "insurer_id is required" }, { status: 400 });
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (status && ["active_pending_review", "active", "suspended"].includes(status)) {
    updates.status = status;
    updates.reviewed_at = new Date().toISOString();
    updates.reviewed_by = caller.userId;

    if (status === "active") {
      updates.activated_at = new Date().toISOString();
    }
  }

  if (plan_tier !== undefined) {
    updates.plan_tier = plan_tier || null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("insurers")
    .update(updates)
    .eq("id", insurer_id)
    .select("id, name, status, plan_tier, activated_at, reviewed_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, insurer: data });
}
