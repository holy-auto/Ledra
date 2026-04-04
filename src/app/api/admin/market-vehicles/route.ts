import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { escapeIlike } from "@/lib/sanitize";
import { enforceBilling } from "@/lib/billing/guard";
import { apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

const MV_COLS = "id, tenant_id, maker, model, grade, year, mileage, color, color_code, plate_number, chassis_number, engine_type, displacement, transmission, drive_type, fuel_type, door_count, seating_capacity, body_type, inspection_date, repair_history, condition_grade, condition_note, asking_price, wholesale_price, description, features, status, listed_at, created_at, updated_at";
const MVI_COLS = "id, vehicle_id, tenant_id, storage_path, file_name, content_type, file_size, sort_order, created_at";

export const dynamic = "force-dynamic";

// ─── GET: BtoB中古車在庫一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const singleId = url.searchParams.get("id") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const maker = url.searchParams.get("maker") ?? "";
    const bodyType = url.searchParams.get("body_type") ?? "";
    const search = url.searchParams.get("search") ?? "";
    const isPublic = url.searchParams.get("public") === "true";

    // Single vehicle by ID
    if (singleId) {
      let q = supabase.from("market_vehicles").select(MV_COLS).eq("id", singleId);
      if (!isPublic) q = q.eq("tenant_id", caller.tenantId);
      else q = q.eq("status", "listed");
      const { data: vehicles, error } = await q;
      if (error) {
        return apiInternalError(error, "market-vehicles single fetch");
      }
      // Fetch images
      let imgs: any[] = [];
      if (vehicles && vehicles.length > 0) {
        const { data } = await supabase.from("market_vehicle_images").select(MVI_COLS).eq("vehicle_id", singleId).order("sort_order", { ascending: true });
        imgs = data ?? [];
      }
      const enriched = (vehicles ?? []).map((v) => ({ ...v, images: imgs }));
      return NextResponse.json({ vehicles: enriched, stats: { total: enriched.length, listed: 0, draft: 0 } });
    }

    let query;

    if (isPublic) {
      // Cross-tenant: only listed vehicles
      query = supabase
        .from("market_vehicles")
        .select(MV_COLS)
        .eq("status", "listed")
        .order("listed_at", { ascending: false });
    } else {
      // Tenant's own vehicles: show all statuses
      query = supabase
        .from("market_vehicles")
        .select(MV_COLS)
        .eq("tenant_id", caller.tenantId)
        .order("created_at", { ascending: false });

      if (status && status !== "all") query = query.eq("status", status);
    }

    if (maker) query = query.eq("maker", maker);
    if (bodyType) query = query.eq("body_type", bodyType);
    if (search) {
      const sq = escapeIlike(search);
      query = query.or(`maker.ilike.%${sq}%,model.ilike.%${sq}%`);
    }

    const { data: vehicles, error } = await query;
    if (error) {
      return apiInternalError(error, "market-vehicles list");
    }

    // Fetch images for all vehicles
    const vehicleIds = (vehicles ?? []).map((v) => v.id);
    let imagesMap: Record<string, any[]> = {};

    if (vehicleIds.length > 0) {
      const { data: images } = await supabase
        .from("market_vehicle_images")
        .select(MVI_COLS)
        .in("vehicle_id", vehicleIds)
        .order("sort_order", { ascending: true });

      (images ?? []).forEach((img) => {
        if (!imagesMap[img.vehicle_id]) imagesMap[img.vehicle_id] = [];
        imagesMap[img.vehicle_id].push(img);
      });
    }

    const enriched = (vehicles ?? []).map((v) => ({
      ...v,
      images: imagesMap[v.id] ?? [],
    }));

    // Stats (only for tenant's own vehicles)
    const allVehicles = isPublic ? enriched : enriched;
    const total = allVehicles.length;
    const listed = allVehicles.filter((v) => v.status === "listed").length;
    const draft = allVehicles.filter((v) => v.status === "draft").length;

    return NextResponse.json({
      vehicles: enriched,
      stats: { total, listed, draft },
    });
  } catch (e: unknown) {
    return apiInternalError(e, "market-vehicles list");
  }
}

// ─── POST: 中古車登録 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req as any, { minPlan: "standard", action: "market_create", tenantId: caller.tenantId });
    if (deny) return deny as any;

    const body = await req.json().catch(() => ({} as any));

    const makerVal = (body?.maker ?? "").trim();
    const modelVal = (body?.model ?? "").trim();
    if (!makerVal || !modelVal) {
      return apiValidationError("maker and model are required");
    }

    const row: Record<string, unknown> = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      maker: makerVal,
      model: modelVal,
      status: body.status ?? "draft",
    };

    // Optional fields
    if (body.grade !== undefined) row.grade = body.grade;
    if (body.year !== undefined) row.year = body.year;
    if (body.mileage !== undefined) row.mileage = body.mileage;
    if (body.color !== undefined) row.color = body.color;
    if (body.color_code !== undefined) row.color_code = body.color_code;
    if (body.plate_number !== undefined) row.plate_number = body.plate_number;
    if (body.chassis_number !== undefined) row.chassis_number = body.chassis_number;
    if (body.engine_type !== undefined) row.engine_type = body.engine_type;
    if (body.displacement !== undefined) row.displacement = body.displacement;
    if (body.transmission !== undefined) row.transmission = body.transmission;
    if (body.drive_type !== undefined) row.drive_type = body.drive_type;
    if (body.fuel_type !== undefined) row.fuel_type = body.fuel_type;
    if (body.door_count !== undefined) row.door_count = body.door_count;
    if (body.seating_capacity !== undefined) row.seating_capacity = body.seating_capacity;
    if (body.body_type !== undefined) row.body_type = body.body_type;
    if (body.inspection_date !== undefined) row.inspection_date = body.inspection_date;
    if (body.repair_history !== undefined) row.repair_history = body.repair_history;
    if (body.condition_grade !== undefined) row.condition_grade = body.condition_grade;
    if (body.condition_note !== undefined) row.condition_note = body.condition_note;
    if (body.asking_price !== undefined) row.asking_price = body.asking_price;
    if (body.wholesale_price !== undefined) row.wholesale_price = body.wholesale_price;
    if (body.description !== undefined) row.description = body.description;
    if (body.features !== undefined) row.features = body.features;

    // If status is 'listed', set listed_at
    if (row.status === "listed") {
      row.listed_at = new Date().toISOString();
    }

    const { data, error } = await supabase.from("market_vehicles").insert(row).select(MV_COLS).single();
    if (error) {
      return apiInternalError(error, "market-vehicles insert");
    }

    return NextResponse.json({ ok: true, vehicle: data });
  } catch (e: unknown) {
    return apiInternalError(e, "market-vehicles create");
  }
}

// ─── PUT: 中古車更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req as any, { minPlan: "standard", action: "market_update", tenantId: caller.tenantId });
    if (deny) return deny as any;

    const body = await req.json().catch(() => ({} as any));
    const id = (body?.id ?? "").trim();
    if (!id) return apiValidationError("missing_id");

    // Check current status for listed_at logic
    const { data: existing } = await supabase
      .from("market_vehicles")
      .select("status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!existing) return apiNotFound("not_found");

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.maker !== undefined) updates.maker = body.maker;
    if (body.model !== undefined) updates.model = body.model;
    if (body.grade !== undefined) updates.grade = body.grade;
    if (body.year !== undefined) updates.year = body.year;
    if (body.mileage !== undefined) updates.mileage = body.mileage;
    if (body.color !== undefined) updates.color = body.color;
    if (body.color_code !== undefined) updates.color_code = body.color_code;
    if (body.plate_number !== undefined) updates.plate_number = body.plate_number;
    if (body.chassis_number !== undefined) updates.chassis_number = body.chassis_number;
    if (body.engine_type !== undefined) updates.engine_type = body.engine_type;
    if (body.displacement !== undefined) updates.displacement = body.displacement;
    if (body.transmission !== undefined) updates.transmission = body.transmission;
    if (body.drive_type !== undefined) updates.drive_type = body.drive_type;
    if (body.fuel_type !== undefined) updates.fuel_type = body.fuel_type;
    if (body.door_count !== undefined) updates.door_count = body.door_count;
    if (body.seating_capacity !== undefined) updates.seating_capacity = body.seating_capacity;
    if (body.body_type !== undefined) updates.body_type = body.body_type;
    if (body.inspection_date !== undefined) updates.inspection_date = body.inspection_date;
    if (body.repair_history !== undefined) updates.repair_history = body.repair_history;
    if (body.condition_grade !== undefined) updates.condition_grade = body.condition_grade;
    if (body.condition_note !== undefined) updates.condition_note = body.condition_note;
    if (body.asking_price !== undefined) updates.asking_price = body.asking_price;
    if (body.wholesale_price !== undefined) updates.wholesale_price = body.wholesale_price;
    if (body.status !== undefined) updates.status = body.status;
    if (body.description !== undefined) updates.description = body.description;
    if (body.features !== undefined) updates.features = body.features;

    // When status changes to 'listed', set listed_at
    if (body.status === "listed" && existing.status !== "listed") {
      updates.listed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("market_vehicles")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(MV_COLS)
      .single();

    if (error) {
      return apiInternalError(error, "market-vehicles update");
    }

    return NextResponse.json({ ok: true, vehicle: data });
  } catch (e: unknown) {
    return apiInternalError(e, "market-vehicles update");
  }
}

// ─── DELETE: 中古車削除（下書きのみ） ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req as any, { minPlan: "standard", action: "market_delete", tenantId: caller.tenantId });
    if (deny) return deny as any;

    const body = await req.json().catch(() => ({} as any));
    const id = (body?.id ?? "").trim();
    if (!id) return apiValidationError("missing_id");

    // Fetch vehicle to check status
    const { data: vehicle } = await supabase
      .from("market_vehicles")
      .select("status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!vehicle) return apiNotFound("not_found");

    if (vehicle.status !== "draft") {
      return apiValidationError("下書きステータスの車両のみ削除できます。");
    }

    // Delete associated images from storage
    const { data: images } = await supabase
      .from("market_vehicle_images")
      .select("storage_path")
      .eq("vehicle_id", id)
      .eq("tenant_id", caller.tenantId);

    if (images && images.length > 0) {
      const paths = images.map((img) => img.storage_path).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from("market-vehicle-images").remove(paths);
      }

      // Delete image records
      await supabase
        .from("market_vehicle_images")
        .delete()
        .eq("vehicle_id", id)
        .eq("tenant_id", caller.tenantId);
    }

    // Delete the vehicle
    const { error } = await supabase
      .from("market_vehicles")
      .delete()
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) {
      return apiInternalError(error, "market-vehicles delete");
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "market-vehicles delete");
  }
}
