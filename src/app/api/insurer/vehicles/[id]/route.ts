import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";

function getClientMeta(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  return { ip, ua };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    const { id } = await params;
    if (!id) return apiValidationError("Missing vehicle id");

    const { ip, ua } = getClientMeta(req);
    const supabase = await createClient();
    const { admin } = createInsurerScopedAdmin(caller.insurerId);

    const { data: vehicle, error: vErr } = await admin
      .from("vehicles")
      .select("id, maker, model, year, plate_display, vin_code, size_class, tenant_id")
      .eq("id", id)
      .maybeSingle();

    if (vErr) return apiValidationError(vErr.message);
    if (!vehicle) return apiNotFound("車両が見つかりません。");

    // cross-tenant IDOR 防止: admin クライアントは RLS をバイパスするため、
    // 車両 (VIN / ナンバー / 所属テナント) を返す前に、この保険会社が当該
    // 車両の所属テナントへアクセス権を持つことを必ず検証する。権限がなければ
    // 存在を秘匿するため 404 を返す。
    const { data: access } = await admin
      .from("insurer_tenant_access")
      .select("tenant_id")
      .eq("insurer_id", caller.insurerId)
      .eq("tenant_id", vehicle.tenant_id)
      .eq("is_active", true)
      .is("revoked_at", null) // 失効済みグラントは認可しない (RPC の述語と一致させる)
      .maybeSingle();
    if (!access) return apiNotFound("車両が見つかりません。");

    const { data: tenant } = await admin.from("tenants").select("name").eq("id", vehicle.tenant_id).maybeSingle();

    const { data: certs, error: cErr } = await supabase.rpc("insurer_get_vehicle_certificates", {
      p_vehicle_id: id,
      p_ip: ip,
      p_user_agent: ua,
    });

    if (cErr) return apiValidationError(cErr.message);

    return apiJson({
      vehicle: { ...vehicle, tenant_name: tenant?.name ?? "" },
      certificates: certs ?? [],
    });
  } catch (e) {
    return apiInternalError(e, "GET /api/insurer/vehicles/[id]");
  }
}
