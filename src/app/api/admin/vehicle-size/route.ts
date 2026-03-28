import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { calcSizeClass } from "@/lib/ocr/shakensho";
import { escapeIlike } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/vehicle-size?maker=xxx&model=xxx
 * GET /api/admin/vehicle-size?length_mm=XXXX&width_mm=XXXX&height_mm=XXXX
 *
 * 寸法が指定された場合は体積から直接判定。
 * メーカー・車種が指定された場合は車種サイズマスタから判定。
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { searchParams } = new URL(req.url);

    // --- Dimension-based calculation (priority) ---
    const lengthStr = searchParams.get("length_mm");
    const widthStr = searchParams.get("width_mm");
    const heightStr = searchParams.get("height_mm");

    if (lengthStr && widthStr && heightStr) {
      const length_mm = parseInt(lengthStr, 10);
      const width_mm = parseInt(widthStr, 10);
      const height_mm = parseInt(heightStr, 10);

      if (
        !isNaN(length_mm) && length_mm > 0 &&
        !isNaN(width_mm) && width_mm > 0 &&
        !isNaN(height_mm) && height_mm > 0
      ) {
        const volume_m3 = (length_mm * width_mm * height_mm) / 1e9;
        return apiOk({
          size_class: calcSizeClass(length_mm, width_mm, height_mm),
          volume_m3: Math.round(volume_m3 * 100) / 100,
          dimensions: { length: length_mm, width: width_mm, height: height_mm },
          match: "dimensions",
        });
      }
    }

    // --- Maker/model lookup ---
    const maker = searchParams.get("maker")?.trim() ?? "";
    const model = searchParams.get("model")?.trim() ?? "";

    if (!maker || !model) {
      return apiOk({ size_class: null });
    }

    // 完全一致
    const { data: exact } = await supabase
      .from("vehicle_size_master")
      .select("size_class, body_type, full_length_mm, full_width_mm, full_height_mm, volume_m3")
      .eq("maker", maker)
      .eq("model", model)
      .limit(1)
      .maybeSingle();

    if (exact) {
      return apiOk({
        size_class: exact.size_class,
        body_type: exact.body_type,
        volume_m3: exact.volume_m3,
        dimensions: {
          length: exact.full_length_mm,
          width: exact.full_width_mm,
          height: exact.full_height_mm,
        },
        match: "exact",
      });
    }

    // 部分一致（モデル名を含む）
    const { data: partial } = await supabase
      .from("vehicle_size_master")
      .select("size_class, model, body_type")
      .eq("maker", maker)
      .ilike("model", `%${escapeIlike(model)}%`)
      .limit(1)
      .maybeSingle();

    if (partial) {
      return apiOk({
        size_class: partial.size_class,
        body_type: partial.body_type,
        matched_model: partial.model,
        match: "partial",
      });
    }

    return apiOk({ size_class: null, match: "none" });
  } catch (e) {
    return apiInternalError(e, "vehicle-size");
  }
}
