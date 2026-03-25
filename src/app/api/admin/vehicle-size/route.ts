import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/vehicle-size?maker=xxx&model=xxx
 * 車種サイズマスタから自動判定
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { searchParams } = new URL(req.url);
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
      .ilike("model", `%${model}%`)
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
