import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

const interestCreateSchema = z.object({
  vehicle_id: z.string().uuid("vehicle_id and customer_name required"),
  customer_name: z.string().trim().min(1, "vehicle_id and customer_name required").max(100),
  customer_phone: optionalText(40),
  customer_email: optionalText(120),
  interest_level: z.enum(["hot", "warm", "cold"]).default("warm"),
  note: optionalText(2000),
  follow_up_date: optionalText(30),
});

const interestUpdateSchema = z.object({
  id: z.string().uuid("id is required"),
  customer_name: z.string().trim().min(1).max(100).optional(),
  customer_phone: optionalText(40),
  customer_email: optionalText(120),
  interest_level: z.enum(["hot", "warm", "cold"]).optional(),
  note: optionalText(2000),
  follow_up_date: optionalText(30),
});

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
      .select(
        "id, vehicle_id, tenant_id, customer_name, customer_phone, customer_email, interest_level, note, follow_up_date, created_at, updated_at",
      )
      .eq("vehicle_id", vehicleId)
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return apiJson({ interests: data ?? [] });
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

    const parsed = interestCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { data, error } = await supabase
      .from("vehicle_interests")
      .insert({
        ...parsed.data,
        tenant_id: caller.tenantId,
      })
      .select(
        "id, vehicle_id, tenant_id, customer_name, customer_phone, customer_email, interest_level, note, follow_up_date, created_at, updated_at",
      )
      .single();

    if (error) throw error;
    return apiJson({ ok: true, interest: data });
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

    const parsed = interestUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, ...fields } = parsed.data;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }

    const { data, error } = await supabase
      .from("vehicle_interests")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, vehicle_id, tenant_id, customer_name, customer_phone, customer_email, interest_level, note, follow_up_date, created_at, updated_at",
      )
      .single();

    if (error) throw error;
    return apiJson({ ok: true, interest: data });
  } catch (e) {
    return apiInternalError(e, "vehicle-interests PUT");
  }
}
