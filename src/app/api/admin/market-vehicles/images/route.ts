import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_IMAGES_PER_VEHICLE = 20;

// ─── GET: List images for a vehicle ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const vehicleId = url.searchParams.get("vehicle_id");
    if (!vehicleId)
      return NextResponse.json(
        { error: "missing vehicle_id" },
        { status: 400 }
      );

    // Verify vehicle belongs to caller's tenant
    const { data: vehicle } = await supabase
      .from("market_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!vehicle)
      return NextResponse.json(
        { error: "vehicle_not_found" },
        { status: 404 }
      );

    const { data: images, error } = await supabase
      .from("market_vehicle_images")
      .select("id, vehicle_id, storage_path, file_name, sort_order, content_type, file_size, tenant_id, created_at")
      .eq("vehicle_id", vehicleId)
      .eq("tenant_id", caller.tenantId)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[market-vehicle-images] db_error:", error.message);
      return NextResponse.json(
        { error: "db_error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ images: images ?? [] });
  } catch (e: any) {
    console.error("market vehicle images GET error", e);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }
}

// ─── POST: Upload image ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const form = await req.formData();
    const vehicleId = String(form.get("vehicle_id") ?? "").trim();
    const file = form.get("file") as File | null;

    if (!vehicleId)
      return NextResponse.json(
        { error: "missing vehicle_id" },
        { status: 400 }
      );
    if (!file || !file.size)
      return NextResponse.json({ error: "missing file" }, { status: 400 });

    // Validate MIME
    const mime = file.type || "application/octet-stream";
    if (!ALLOWED_MIME.includes(mime))
      return NextResponse.json(
        { error: "invalid_file_type", allowed: ALLOWED_MIME },
        { status: 400 }
      );

    // Validate size
    if (file.size > MAX_FILE_BYTES)
      return NextResponse.json(
        { error: "file_too_large", max_bytes: MAX_FILE_BYTES },
        { status: 400 }
      );

    // Verify vehicle belongs to caller's tenant
    const { data: vehicle } = await supabase
      .from("market_vehicles")
      .select("id, tenant_id")
      .eq("id", vehicleId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!vehicle)
      return NextResponse.json(
        { error: "vehicle_not_found" },
        { status: 404 }
      );

    // Check max images
    const { count: existingCount } = await supabase
      .from("market_vehicle_images")
      .select("id", { count: "exact", head: true })
      .eq("vehicle_id", vehicleId)
      .eq("tenant_id", caller.tenantId);

    const existing = existingCount ?? 0;
    if (existing >= MAX_IMAGES_PER_VEHICLE)
      return NextResponse.json(
        {
          error: "image_limit_reached",
          max: MAX_IMAGES_PER_VEHICLE,
          current: existing,
        },
        { status: 422 }
      );

    // Build storage path
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const storagePath = `market/${caller.tenantId}/${vehicleId}/${Date.now()}_${existing}.${ext}`;

    // Upload to storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("market")
      .upload(storagePath, buffer, { contentType: mime, upsert: false });

    if (uploadError) {
      console.error("market image upload error", uploadError);
      return NextResponse.json(
        { error: "upload_failed" },
        { status: 500 }
      );
    }

    // Insert record
    const { data: image, error: insertError } = await supabase
      .from("market_vehicle_images")
      .insert({
        vehicle_id: vehicleId,
        tenant_id: caller.tenantId,
        storage_path: storagePath,
        file_name: file.name || `photo_${existing + 1}.${ext}`,
        content_type: mime,
        file_size: file.size,
        sort_order: existing,
      })
      .select("id, storage_path, file_name, sort_order")
      .single();

    if (insertError) {
      console.error("[market-vehicle-images] db_error (insert):", insertError.message);
      // Attempt to clean up uploaded file
      await supabase.storage.from("market").remove([storagePath]);
      return NextResponse.json(
        { error: "db_error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, image });
  } catch (e: any) {
    console.error("market vehicle images POST error", e);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }
}

// ─── DELETE: Delete image ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const { id, vehicle_id: vehicleId } = body;

    if (!id || !vehicleId)
      return NextResponse.json(
        { error: "missing id or vehicle_id" },
        { status: 400 }
      );

    // Verify image belongs to caller's tenant
    const { data: image } = await supabase
      .from("market_vehicle_images")
      .select("id, storage_path, tenant_id")
      .eq("id", id)
      .eq("vehicle_id", vehicleId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!image)
      return NextResponse.json(
        { error: "image_not_found" },
        { status: 404 }
      );

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from("market")
      .remove([image.storage_path]);

    if (storageError) {
      console.error("market image storage delete error", storageError);
      // Continue to delete the DB record even if storage delete fails
    }

    // Delete record
    const { error: deleteError } = await supabase
      .from("market_vehicle_images")
      .delete()
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (deleteError) {
      console.error("[market-vehicle-images] db_error (delete):", deleteError.message);
      return NextResponse.json(
        { error: "db_error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("market vehicle images DELETE error", e);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }
}
