import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

const imageDeleteSchema = z.object({
  id: z.string().uuid("missing id or vehicle_id"),
  vehicle_id: z.string().uuid("missing id or vehicle_id"),
});

export const dynamic = "force-dynamic";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_IMAGES_PER_VEHICLE = 20;

// ─── GET: List images for a vehicle ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const vehicleId = url.searchParams.get("vehicle_id");
    if (!vehicleId) return apiValidationError("missing vehicle_id");

    // Verify vehicle belongs to caller's tenant
    const { data: vehicle } = await supabase
      .from("market_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!vehicle) return apiNotFound("vehicle_not_found");

    const { data: images, error } = await supabase
      .from("market_vehicle_images")
      .select("id, vehicle_id, tenant_id, storage_path, file_name, content_type, file_size, sort_order, created_at")
      .eq("vehicle_id", vehicleId)
      .eq("tenant_id", caller.tenantId)
      .order("sort_order", { ascending: true });

    if (error) {
      return apiInternalError(error, "market-vehicle-images list");
    }

    return apiJson({ images: images ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "market-vehicle-images GET");
  }
}

// ─── POST: Upload image ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const form = await req.formData();
    const vehicleId = String(form.get("vehicle_id") ?? "").trim();
    const file = form.get("file") as File | null;

    if (!vehicleId) return apiValidationError("missing vehicle_id");
    if (!file || !file.size) return apiValidationError("missing file");

    // Validate MIME
    const mime = file.type || "application/octet-stream";
    if (!ALLOWED_MIME.includes(mime)) return apiValidationError("invalid_file_type");

    // Validate size
    if (file.size > MAX_FILE_BYTES) return apiValidationError("file_too_large");

    // Verify vehicle belongs to caller's tenant
    const { data: vehicle } = await supabase
      .from("market_vehicles")
      .select("id, tenant_id")
      .eq("id", vehicleId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!vehicle) return apiNotFound("vehicle_not_found");

    // Check max images
    const { count: existingCount } = await supabase
      .from("market_vehicle_images")
      .select("id", { count: "exact", head: true })
      .eq("vehicle_id", vehicleId)
      .eq("tenant_id", caller.tenantId);

    const existing = existingCount ?? 0;
    if (existing >= MAX_IMAGES_PER_VEHICLE)
      return apiJson(
        {
          error: "image_limit_reached",
          max: MAX_IMAGES_PER_VEHICLE,
          current: existing,
        },
        { status: 422 },
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
      return apiInternalError(uploadError, "market-vehicle-images upload");
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
      // Attempt to clean up uploaded file
      await supabase.storage.from("market").remove([storagePath]);
      return apiInternalError(insertError, "market-vehicle-images insert");
    }

    return apiJson({ ok: true, image });
  } catch (e: unknown) {
    return apiInternalError(e, "market-vehicle-images POST");
  }
}

// ─── DELETE: Delete image ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = imageDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, vehicle_id: vehicleId } = parsed.data;

    // Verify image belongs to caller's tenant
    const { data: image } = await supabase
      .from("market_vehicle_images")
      .select("id, storage_path, tenant_id")
      .eq("id", id)
      .eq("vehicle_id", vehicleId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!image) return apiNotFound("image_not_found");

    // Delete from storage
    const { error: storageError } = await supabase.storage.from("market").remove([image.storage_path]);

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
      return apiInternalError(deleteError, "market-vehicle-images delete");
    }

    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "market-vehicle-images DELETE");
  }
}
