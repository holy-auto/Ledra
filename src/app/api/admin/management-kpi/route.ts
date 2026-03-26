import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasPermission } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!hasPermission(caller.role as Role, "management:view")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const { data, error } = await supabase.rpc("management_kpi_stats", {
      p_tenant_id: caller.tenantId,
    });

    if (error) {
      console.error("[management-kpi] RPC failed:", error);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: unknown) {
    console.error("[management-kpi] GET failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
