import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerBasic } from "@/lib/api/auth";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiForbidden } from "@/lib/api/response";
import { orderCreateSchema, orderUpdateSchema } from "@/lib/validations/order";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // sent | received | all
    const status = searchParams.get("status");

    // Fetch orders where this tenant is sender or receiver
    let query = supabase
      .from("job_orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (type === "sent") {
      query = query.eq("from_tenant_id", caller.tenantId);
    } else if (type === "received") {
      query = query.eq("to_tenant_id", caller.tenantId);
    } else {
      query = query.or(`from_tenant_id.eq.${caller.tenantId},to_tenant_id.eq.${caller.tenantId}`);
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
  } catch (e) {
    return apiInternalError(e, "orders list");
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = orderCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が無効です。");
    }

    const { to_tenant_id, title, description, category, budget, deadline } = parsed.data;

    const { data, error } = await supabase
      .from("job_orders")
      .insert({
        from_tenant_id: caller.tenantId,
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
      return apiInternalError(error, "order create");
    }

    return apiOk({ order: data });
  } catch (e) {
    return apiInternalError(e, "order create");
  }
}

// ─── PUT: ステータス更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = orderUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が無効です。");
    }

    const { id, status } = parsed.data;

    const { data, error } = await supabase
      .from("job_orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .or(`from_tenant_id.eq.${caller.tenantId},to_tenant_id.eq.${caller.tenantId}`)
      .select()
      .single();

    if (error) {
      return apiInternalError(error, "order status update");
    }

    return apiOk({ order: data });
  } catch (e) {
    return apiInternalError(e, "order status update");
  }
}
