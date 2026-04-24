import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { escapeIlike } from "@/lib/sanitize";
import { enforceBilling } from "@/lib/billing/guard";
import { apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import {
  marketVehicleCreateSchema,
  marketVehicleDeleteSchema,
  marketVehicleUpdateSchema,
} from "@/lib/validations/market";

const MV_COLS =
  "id, tenant_id, maker, model, grade, year, mileage, color, color_code, plate_number, chassis_number, engine_type, displacement, transmission, drive_type, fuel_type, door_count, seating_capacity, body_type, inspection_date, repair_history, condition_grade, condition_note, asking_price, wholesale_price, description, features, status, listed_at, created_at, updated_at";
const MVI_COLS = "id, vehicle_id, tenant_id, storage_path, file_name, content_type, file_size, sort_order, created_at";

type MarketVehicleImageRow = {
  id: string;
  vehicle_id: string;
  tenant_id: string;
  storage_path: string;
  file_name: string | null;
  content_type: string | null;
  file_size: number | null;
  sort_order: number | null;
  created_at: string | null;
};

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
      let imgs: MarketVehicleImageRow[] = [];
      if (vehicles && vehicles.length > 0) {
        const { data } = await supabase
          .from("market_vehicle_images")
          .select(MVI_COLS)
          .eq("vehicle_id", singleId)
          .order("sort_order", { ascending: true })
          .returns<MarketVehicleImageRow[]>();
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
    const imagesMap: Record<string, MarketVehicleImageRow[]> = {};

    if (vehicleIds.length > 0) {
      const { data: images } = await supabase
        .from("market_vehicle_images")
        .select(MVI_COLS)
        .in("vehicle_id", vehicleIds)
        .order("sort_order", { ascending: true })
        .returns<MarketVehicleImageRow[]>();

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

    const deny = await enforceBilling(req, {
      minPlan: "standard",
      action: "market_create",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const parsed = marketVehicleCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const row: Record<string, unknown> = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      ...parsed.data,
    };

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

    const deny = await enforceBilling(req, {
      minPlan: "standard",
      action: "market_update",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const parsed = marketVehicleUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, ...fields } = parsed.data;

    // Check current status for listed_at logic
    const { data: existing } = await supabase
      .from("market_vehicles")
      .select("status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!existing) return apiNotFound("not_found");

    const updates: Record<string, unknown> = {
      ...fields,
      updated_at: new Date().toISOString(),
    };

    // When status changes to 'listed', set listed_at
    if (fields.status === "listed" && existing.status !== "listed") {
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

    const deny = await enforceBilling(req, {
      minPlan: "standard",
      action: "market_delete",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const parsed = marketVehicleDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id } = parsed.data;

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
      await supabase.from("market_vehicle_images").delete().eq("vehicle_id", id).eq("tenant_id", caller.tenantId);
    }

    // Delete the vehicle
    const { error } = await supabase.from("market_vehicles").delete().eq("id", id).eq("tenant_id", caller.tenantId);

    if (error) {
      return apiInternalError(error, "market-vehicles delete");
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "market-vehicles delete");
  }
}
