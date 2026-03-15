import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

async function getMyTenantId(supabase: any) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return null;
  const { data } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();
  return data?.tenant_id as string | null;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = await getMyTenantId(supabase);
    if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 403 });

    const { searchParams } = new URL(req.url);
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
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = await getMyTenantId(supabase);
    if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 403 });

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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ order: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT: ステータス更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = await getMyTenantId(supabase);
    if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 403 });

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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, order: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
