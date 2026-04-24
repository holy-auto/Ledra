import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("hearings")
      .select(
        "id, tenant_id, customer_name, customer_phone, customer_email, vehicle_maker, vehicle_model, vehicle_year, vehicle_plate, vehicle_color, vehicle_vin, service_type, vehicle_size, coating_history, desired_menu, budget_range, concern_areas, scratches_dents, parking_environment, usage_frequency, additional_requests, hearing_json, status, customer_id, vehicle_id, created_at, updated_at",
      )
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query.limit(200);
    if (error) return apiInternalError(error, "hearings GET");

    return apiJson({ hearings: data ?? [] });
  } catch (e: unknown) {
    console.error("[hearings] GET failed:", e);
    return apiInternalError(e, "hearings");
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json();

    // ヒアリングレコード作成
    const { data, error } = await supabase
      .from("hearings")
      .insert({
        tenant_id: caller.tenantId,
        customer_name: body.customer_name || "",
        customer_phone: body.customer_phone || "",
        customer_email: body.customer_email || "",
        vehicle_maker: body.vehicle_maker || "",
        vehicle_model: body.vehicle_model || "",
        vehicle_year: body.vehicle_year ? Number(body.vehicle_year) : null,
        vehicle_plate: body.vehicle_plate || "",
        vehicle_color: body.vehicle_color || "",
        vehicle_vin: body.vehicle_vin || "",
        service_type: body.service_type || "",
        vehicle_size: body.vehicle_size || "",
        coating_history: body.coating_history || "",
        desired_menu: body.desired_menu || "",
        budget_range: body.budget_range || "",
        concern_areas: body.concern_areas || "",
        scratches_dents: body.scratches_dents || "",
        parking_environment: body.parking_environment || "",
        usage_frequency: body.usage_frequency || "",
        additional_requests: body.additional_requests || "",
        hearing_json: body.hearing_json || {},
        status: "draft",
      })
      .select("id")
      .single();

    if (error) return apiInternalError(error, "hearings POST");

    return apiJson({ ok: true, id: data.id });
  } catch (e: unknown) {
    console.error("[hearings] POST failed:", e);
    return apiInternalError(e, "hearings");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json();
    const { id, action, ...fields } = body;
    if (!id) return apiValidationError("id は必須です");

    // アクション: 顧客登録連携
    if (action === "link_customer") {
      // 顧客レコード作成
      const { data: hearing } = await supabase
        .from("hearings")
        .select(
          "id, customer_name, customer_phone, customer_email, vehicle_maker, vehicle_model, vehicle_year, vehicle_plate, vehicle_vin, vehicle_size",
        )
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .single();

      if (!hearing) return apiNotFound("ヒアリングが見つかりません。");

      // 顧客作成
      const { data: customer, error: custErr } = await supabase
        .from("customers")
        .insert({
          tenant_id: caller.tenantId,
          name: hearing.customer_name || "未入力",
          email: hearing.customer_email || null,
          phone: hearing.customer_phone || null,
        })
        .select("id")
        .single();

      if (custErr) return apiInternalError(custErr, "hearings link_customer");

      // 車両作成
      let vehicleId: string | null = null;
      if (hearing.vehicle_maker || hearing.vehicle_model) {
        const { data: vehicle, error: vehErr } = await supabase
          .from("vehicles")
          .insert({
            tenant_id: caller.tenantId,
            maker: hearing.vehicle_maker || null,
            model: hearing.vehicle_model || null,
            year: hearing.vehicle_year || null,
            plate_display: hearing.vehicle_plate || null,
            vin_code: hearing.vehicle_vin || null,
            customer_id: customer.id,
            size_class: hearing.vehicle_size || null,
          })
          .select("id")
          .single();
        if (!vehErr && vehicle) vehicleId = vehicle.id;
      }

      // ヒアリングレコード更新
      await supabase
        .from("hearings")
        .update({
          customer_id: customer.id,
          vehicle_id: vehicleId,
          status: "linked",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      return apiJson({
        ok: true,
        customer_id: customer.id,
        vehicle_id: vehicleId,
      });
    }

    // 通常更新
    const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowedFields = [
      "customer_name",
      "customer_phone",
      "customer_email",
      "vehicle_maker",
      "vehicle_model",
      "vehicle_year",
      "vehicle_plate",
      "vehicle_color",
      "vehicle_vin",
      "service_type",
      "vehicle_size",
      "coating_history",
      "desired_menu",
      "budget_range",
      "concern_areas",
      "scratches_dents",
      "parking_environment",
      "usage_frequency",
      "additional_requests",
      "hearing_json",
      "status",
    ];
    for (const k of allowedFields) {
      if (k in fields) updateFields[k] = fields[k];
    }

    const { error } = await supabase
      .from("hearings")
      .update(updateFields)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) return apiInternalError(error, "hearings PUT");
    return apiJson({ ok: true });
  } catch (e: unknown) {
    console.error("[hearings] PUT failed:", e);
    return apiInternalError(e, "hearings");
  }
}
