import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { vehicleUpdateSchema } from "@/lib/validations/vehicle";
import { resolveCallerBasic } from "@/lib/api/auth";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (error || !vehicle) return apiNotFound("車両が見つかりません。");

    return apiOk({ vehicle });
  } catch (e) {
    return apiInternalError(e, "vehicles/[id] GET");
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json();
    const parsed = vehicleUpdateSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。");
    }
    const { id: _id, ...fields } = parsed.data;

    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("*")
      .single();

    if (error || !vehicle) {
      if (error?.code === "PGRST116") return apiNotFound("車両が見つかりません。");
      return apiInternalError(error, "vehicles/[id] PUT");
    }

    return apiOk({ vehicle });
  } catch (e) {
    return apiInternalError(e, "vehicles/[id] PUT");
  }
}
