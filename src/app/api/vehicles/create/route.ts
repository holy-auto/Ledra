import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { vehicleCreateSchema } from "@/lib/validations/vehicle";
import { resolveCallerBasic } from "@/lib/api/auth";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const caller = await resolveCallerBasic(supabase);
    if (!caller) {
      return apiUnauthorized();
    }

    const body = await req.json();
    const parsed = vehicleCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。");
    }
    const b = parsed.data;

    // size_classが未指定ならマスタから自動判定
    let sizeClass = b.size_class ?? null;
    if (!sizeClass && b.maker && b.model) {
      const { data: sizeRow } = await supabase
        .from("vehicle_size_master")
        .select("size_class")
        .eq("maker", b.maker)
        .eq("model", b.model)
        .limit(1)
        .maybeSingle();
      if (sizeRow?.size_class) sizeClass = sizeRow.size_class;
    }

    const insertRow = {
      tenant_id: caller.tenantId,
      maker: b.maker,
      model: b.model,
      year: b.year ?? null,
      plate_display: b.plate_display ?? null,
      vin_code: b.vin_code ?? null,
      notes: b.notes ?? null,
      customer_id: b.customer_id ?? null,
      size_class: sizeClass,
    };

    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .insert(insertRow)
      .select("id")
      .single();

    if (error) {
      return apiInternalError(error, "vehicles/create insert");
    }

    return NextResponse.json({ id: vehicle.id }, { status: 200 });
  } catch (e) {
    return apiInternalError(e, "vehicles/create");
  }
}
