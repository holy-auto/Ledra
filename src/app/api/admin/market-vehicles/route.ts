import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";
import { resolveCallerBasic } from "@/lib/api/auth";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/pagination";
import { marketVehicleCreateSchema, marketVehicleUpdateSchema, marketVehicleDeleteSchema } from "@/lib/validations/market";

export const dynamic = "force-dynamic";

// ─── GET: BtoB中古車在庫一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const p = parsePagination(req);
    const url = new URL(req.url);
    const singleId = url.searchParams.get("id") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const maker = url.searchParams.get("maker") ?? "";
    const bodyType = url.searchParams.get("body_type") ?? "";
    const search = url.searchParams.get("search") ?? "";
    const isPublic = url.searchParams.get("public") === "true";

    // Single vehicle by ID
    if (singleId) {
      let q = supabase.from("market_vehicles").select("*").eq("id", singleId);
      if (!isPublic) q = q.eq("tenant_id", caller.tenantId);
      else q = q.eq("status", "listed");
      const { data: vehicles, error } = await q;
      if (error) return apiInternalError(error, "market vehicle get");
      // Fetch images
      let imgs: any[] = [];
      if (vehicles && vehicles.length > 0) {
        const { data } = await supabase.from("market_vehicle_images").select("*").eq("vehicle_id", singleId).order("sort_order", { ascending: true });
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
        .select("*", { count: "exact" })
        .eq("status", "listed")
        .order("listed_at", { ascending: false });
    } else {
      // Tenant's own vehicles: show all statuses
      query = supabase
        .from("market_vehicles")
        .select("*", { count: "exact" })
        .eq("tenant_id", caller.tenantId)
        .order("created_at", { ascending: false });

      if (status && status !== "all") query = query.eq("status", status);
    }

    if (maker) query = query.eq("maker", maker);
    if (bodyType) query = query.eq("body_type", bodyType);
    if (search) {
      const sq = escapePostgrestValue(escapeIlike(search));
      query = query.or(`maker.ilike.%${sq}%,model.ilike.%${sq}%`);
    }

    const { data: vehicles, error, count } = await query.range(p.from, p.to);
    if (error) return apiInternalError(error, "market vehicles list");

    // Fetch images for all vehicles
    const vehicleIds = (vehicles ?? []).map((v) => v.id);
    let imagesMap: Record<string, any[]> = {};

    if (vehicleIds.length > 0) {
      const { data: images } = await supabase
        .from("market_vehicle_images")
        .select("*")
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
    const listed = enriched.filter((v) => v.status === "listed").length;
    const draft = enriched.filter((v) => v.status === "draft").length;

    return NextResponse.json({
      vehicles: enriched,
      page: p.page,
      per_page: p.perPage,
      total: count ?? 0,
      stats: { total: count ?? 0, listed, draft },
    });
  } catch (e) {
    return apiInternalError(e, "market vehicles list");
  }
}

// ─── POST: 中古車登録 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = marketVehicleCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が無効です。");
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

    const { data, error } = await supabase.from("market_vehicles").insert(row).select().single();
    if (error) return apiInternalError(error, "market vehicle create");

    return apiOk({ vehicle: data });
  } catch (e) {
    return apiInternalError(e, "market vehicle create");
  }
}

// ─── PUT: 中古車更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = marketVehicleUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が無効です。");
    }

    const { id, ...updateFields } = parsed.data;

    // Check current status for listed_at logic
    const { data: existing } = await supabase
      .from("market_vehicles")
      .select("status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!existing) return apiNotFound("車両が見つかりません。");

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      ...updateFields,
    };

    // When status changes to 'listed', set listed_at
    if (updateFields.status === "listed" && existing.status !== "listed") {
      updates.listed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("market_vehicles")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) return apiInternalError(error, "market vehicle update");

    return apiOk({ vehicle: data });
  } catch (e) {
    return apiInternalError(e, "market vehicle update");
  }
}

// ─── DELETE: 中古車削除（下書きのみ） ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = marketVehicleDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が無効です。");
    }

    const { id } = parsed.data;

    // Fetch vehicle to check status
    const { data: vehicle } = await supabase
      .from("market_vehicles")
      .select("status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!vehicle) return apiNotFound("車両が見つかりません。");

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

    if (error) return apiInternalError(error, "market vehicle delete");

    return apiOk({});
  } catch (e) {
    return apiInternalError(e, "market vehicle delete");
  }
}
