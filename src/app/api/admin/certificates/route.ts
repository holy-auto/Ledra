import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

/** GET: テナントの証明書一覧（vehicle_id でフィルタ可能） */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get("vehicle_id");
    const perPage = Math.min(200, Math.max(1, parseInt(searchParams.get("per_page") ?? "50", 10)));

    let query = supabase
      .from("certificates")
      .select("id, public_id, status, vehicle_id, customer_id, created_at")
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false })
      .limit(perPage);

    if (vehicleId) {
      query = query.eq("vehicle_id", vehicleId);
    }

    const { data: certificates, error } = await query;

    if (error) {
      console.error("[admin/certificates] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    return NextResponse.json({ certificates: certificates ?? [] });
  } catch (e: any) {
    console.error("admin certificates list failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
