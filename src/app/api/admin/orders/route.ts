import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantId = caller.tenantId;

    const { searchParams } = new URL(req.url);

    // テナント一覧リクエスト
    if (searchParams.has("_tenants")) {
      const { data: memberships } = await supabase
        .from("tenant_memberships")
        .select("tenant_id, tenants:tenants(company_name)")
        .eq("user_id", caller.userId);
      const myTenants = (memberships ?? []).map((m: Record<string, unknown>) => ({
        tenant_id: m.tenant_id,
        tenant_name: (m.tenants as Record<string, unknown>)?.company_name ?? String(m.tenant_id).slice(0, 8),
      }));
      return NextResponse.json({ myTenants });
    }

    const type = searchParams.get("type"); // sent | received | all
    const status = searchParams.get("status");

    // Fetch orders where this tenant is sender or receiver
    let query = supabase
      .from("job_orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (type === "sent") {
      query = query.eq("from_tenant_id", tenantId);
    } else if (type === "received") {
      query = query.eq("to_tenant_id", tenantId);
    } else {
      query = query.or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: orders, error } = await query.limit(100);

    if (error) {
      // Table might not exist yet
      return NextResponse.json({ orders: [], source: "empty" });
    }

    return NextResponse.json({ orders: orders ?? [] });
  } catch (e: unknown) {
    console.error("[orders] GET failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantId = caller.tenantId;

    const body = await req.json();
    const { to_tenant_id, title, description, category, budget, deadline } = body;

    if (!to_tenant_id || !title) {
      return NextResponse.json({ error: "to_tenant_id and title are required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("job_orders")
      .insert({
        from_tenant_id: tenantId,
        to_tenant_id,
        title,
        description: description || null,
        category: category || null,
        budget: budget || null,
        deadline: deadline || null,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("[orders] insert_failed:", error.message);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    return NextResponse.json({ order: data }, { status: 201 });
  } catch (e: unknown) {
    console.error("[orders] POST failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── PUT: ステータス更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantId = caller.tenantId;

    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    const validStatuses = ["pending", "accepted", "in_progress", "completed", "rejected", "cancelled"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("job_orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .select()
      .single();

    if (error) {
      console.error("[orders] update_failed:", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, order: data });
  } catch (e: unknown) {
    console.error("[orders] PUT failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
