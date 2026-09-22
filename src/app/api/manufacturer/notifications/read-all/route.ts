import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT /api/manufacturer/notifications/read-all — 自メーカー宛の未読を全て既読化 */
export async function PUT() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  try {
    const { error } = await supabase
      .from("manufacturer_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("manufacturer_id", caller.manufacturerId)
      .or(`user_id.is.null,user_id.eq.${caller.userId}`)
      .is("read_at", null);
    if (error) return apiInternalError(error, "mark all manufacturer notifications read");
    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "mark all manufacturer notifications read");
  }
}
