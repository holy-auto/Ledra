import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerBasic } from "@/lib/api/auth";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_IMAGES_PER_VEHICLE = 20;

// ─── GET: List images for a vehicle ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const vehicleId = url.searchParams.get("vehicle_id");
    if (!vehicleId) return apiValidationError("vehicle_id は必須です。");

    // Verify vehicle belongs to caller's tenant
    const { data: vehicle } = await supabase
      .from("market_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!vehicle) return apiNotFound("車両が見つかりません。");

    const { data: images, error } = await supabase
      .from("market_vehicle_images")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .eq("tenant_id", caller.tenantId)
      .order("sort_order", { ascending: true });

    if (error) return apiInternalError(error, "market vehicle images list");

    return NextResponse.json({ images: images ?? [] });
  } catch (e) {
    return apiInternalError(e, "market vehicle images GET");
  }
}

// ─── POST: Upload image ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const form = await req.formData();
    const vehicleId = String(form.get("vehicle_id") ?? "").trim();
    const file = form.get("file") as File | null;

    if (!vehicleId) return apiValidationError("vehicle_id は必須です。");
    if (!file || !file.size) return apiValidationError("ファイルは必須です。");

    // Validate MIME
    const mime = file.type || "application/octet-stream";
    if (!ALLOWED_MIME.includes(mime)) {
      return apiValidationError(`許可されていないファイル形式です。許可: ${ALLOWED_MIME.join(", ")}`);
    }

    // Validate size
    if (file.size > MAX_FILE_BYTES) {
      return apiValidationError(`ファイルサイズが大きすぎます。上限: ${MAX_FILE_BYTES / 1024 / 1024}MB`);
    }

    // Verify vehicle belongs to caller's tenant
    const { data: vehicle } = await supabase
      .from("market_vehicles")
      .select("id, tenant_id")
      .eq("id", vehicleId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!vehicle) return apiNotFound("車両が見つかりません。");

    // Check max images
    const { count: existingCount } = await supabase
      .from("market_vehicle_images")
      .select("id", { count: "exact", head: true })
      .eq("vehicle_id", vehicleId)
      .eq("tenant_id", caller.tenantId);

    const existing = existingCount ?? 0;
    if (existing >= MAX_IMAGES_PER_VEHICLE) {
      return apiValidationError(
        `画像数の上限（${MAX_IMAGES_PER_VEHICLE}枚）に達しています。`,
      );
    }

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
      return apiInternalError(uploadError, "market image upload");
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
      return apiInternalError(insertError, "market image record insert");
    }

    return apiOk({ image });
  } catch (e) {
    return apiInternalError(e, "market vehicle images POST");
  }
}

// ─── DELETE: Delete image ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const { id, vehicle_id: vehicleId } = body;

    if (!id || !vehicleId) return apiValidationError("id と vehicle_id は必須です。");

    // Verify image belongs to caller's tenant
    const { data: image } = await supabase
      .from("market_vehicle_images")
      .select("id, storage_path, tenant_id")
      .eq("id", id)
      .eq("vehicle_id", vehicleId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!image) return apiNotFound("画像が見つかりません。");

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

    if (deleteError) return apiInternalError(deleteError, "market image delete");

    return apiOk({});
  } catch (e) {
    return apiInternalError(e, "market vehicle images DELETE");
  }
}
