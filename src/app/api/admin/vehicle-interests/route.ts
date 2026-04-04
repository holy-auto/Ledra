import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

// GET: List customer interests for a vehicle
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const vehicleId = new URL(req.url).searchParams.get("vehicle_id");
    if (!vehicleId) return apiValidationError("vehicle_id required");

    const { data, error } = await supabase
      .from("vehicle_interests")
      .select("id, vehicle_id, tenant_id, customer_name, customer_phone, customer_email, interest_level, note, follow_up_date, created_at, updated_at")
      .eq("vehicle_id", vehicleId)
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ interests: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "vehicle-interests GET");
  }
}

// POST: Add customer interest
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "market:create")) {
      return apiForbidden();
    }

    const body = await req.json();
    const { vehicle_id, customer_name, customer_phone, customer_email, interest_level, note, follow_up_date } = body;

    if (!vehicle_id || !customer_name) {
      return apiValidationError("vehicle_id and customer_name required");
    }

    const { data, error } = await supabase
      .from("vehicle_interests")
      .insert({
        vehicle_id,
        tenant_id: caller.tenantId,
        customer_name,
        customer_phone: customer_phone || null,
        customer_email: customer_email || null,
        interest_level: interest_level || "warm",
        note: note || null,
        follow_up_date: follow_up_date || null,
      })
      .select("id, vehicle_id, tenant_id, customer_name, customer_phone, customer_email, interest_level, note, follow_up_date, created_at, updated_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, interest: data });
  } catch (e) {
    return apiInternalError(e, "vehicle-interests POST");
  }
}

// PUT: Update customer interest
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "market:edit")) {
      return apiForbidden();
    }

    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return apiValidationError("id is required");

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("vehicle_interests")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id, vehicle_id, tenant_id, customer_name, customer_phone, customer_email, interest_level, note, follow_up_date, created_at, updated_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, interest: data });
  } catch (e) {
    return apiInternalError(e, "vehicle-interests PUT");
  }
}
