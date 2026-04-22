import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiUnauthorized,
  apiInternalError,
  apiValidationError,
} from "@/lib/api/response";
import { parseShakenshoAuto, calcSizeClass } from "@/lib/ocr/shakensho";
import { escapeIlike } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

/** Maximum image size: 10 MB */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * POST /api/admin/vehicle-size/ocr
 *
 * Accept a vehicle inspection certificate image (multipart/form-data)
 * and return parsed dimensions, size_class, and other metadata.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // --- Parse multipart form data ---
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file || !(file instanceof File)) {
      return apiValidationError("画像ファイルが必要です。'image' フィールドにファイルを添付してください。");
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return apiValidationError("画像サイズが大きすぎます（上限 10MB）。");
    }

    // Convert to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // --- 2D code → OCR フォールバック ---
    const { data: parsed, source } = await parseShakenshoAuto(imageBuffer);

    // --- Calculate size_class from dimensions if available ---
    let size_class: string | null = null;
    let volume_m3: number | null = null;

    if (parsed.length_mm && parsed.width_mm && parsed.height_mm) {
      size_class = calcSizeClass(parsed.length_mm, parsed.width_mm, parsed.height_mm);
      volume_m3 =
        Math.round(
          (parsed.length_mm * parsed.width_mm * parsed.height_mm) / 1e9 * 100,
        ) / 100;
    }

    // --- Also try maker/model lookup from master for comparison ---
    let master_size_class: string | null = null;
    if (parsed.maker) {
      const model = parsed.model ?? "";
      const { data: exact } = await supabase
        .from("vehicle_size_master")
        .select("size_class")
        .eq("maker", parsed.maker)
        .eq("model", model)
        .limit(1)
        .maybeSingle();

      if (exact?.size_class) {
        master_size_class = exact.size_class;
      } else if (model) {
        // Partial match fallback
        const { data: partial } = await supabase
          .from("vehicle_size_master")
          .select("size_class")
          .eq("maker", parsed.maker)
          .ilike("model", `%${escapeIlike(model)}%`)
          .limit(1)
          .maybeSingle();

        if (partial?.size_class) {
          master_size_class = partial.size_class;
        }
      }
    }

    return apiOk({
      source,
      size_class,
      volume_m3,
      dimensions: parsed.length_mm && parsed.width_mm && parsed.height_mm
        ? {
            length_mm: parsed.length_mm,
            width_mm: parsed.width_mm,
            height_mm: parsed.height_mm,
          }
        : null,
      parsed: {
        maker: parsed.maker ?? null,
        model: parsed.model ?? null,
        vin: parsed.vin ?? null,
        weight_kg: parsed.weight_kg ?? null,
        displacement_cc: parsed.displacement_cc ?? null,
        first_registration: parsed.first_registration ?? null,
      },
      master_size_class,
    });
  } catch (e) {
    return apiInternalError(e, "vehicle-size/ocr");
  }
}
