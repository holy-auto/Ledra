import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { vehicleUpdateSchema } from "@/lib/validations/vehicle";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiForbidden,
} from "@/lib/api/response";
import { emitEntityWebhook } from "@/lib/outbound-webhooks";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .select("*, customer:customers(id, name, email, phone)")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (error || !vehicle) return apiNotFound("車両が見つかりません。");

    return apiOk({ vehicle });
  } catch (e) {
    return apiInternalError(e, "vehicles/[id] GET");
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "vehicles:edit")) return apiForbidden();

    const body = await req.json();
    const parsed = vehicleUpdateSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。");
    }
    const { id: _id, full_length_mm: _l, full_width_mm: _w, full_height_mm: _h, ...fields } = parsed.data;

    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("*, customer:customers(id, name, email, phone)")
      .single();

    if (error || !vehicle) {
      if (error?.code === "PGRST116") return apiNotFound("車両が見つかりません。");
      return apiInternalError(error, "vehicles/[id] PUT");
    }

    await emitEntityWebhook(caller.tenantId, "vehicle.updated", vehicle.id, {
      id: vehicle.id,
      maker: vehicle.maker,
      model: vehicle.model,
      plate_display: vehicle.plate_display,
      vin_code: vehicle.vin_code,
      customer_id: vehicle.customer_id,
    });

    return apiOk({ vehicle });
  } catch (e) {
    return apiInternalError(e, "vehicles/[id] PUT");
  }
}
