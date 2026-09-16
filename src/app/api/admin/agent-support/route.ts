import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("agent-support — platform-wide agent operations (no tenant scope)");
    const status = request.nextUrl.searchParams.get("status");

    let query = admin
      .from("agent_support_tickets")
      .select("*, agents:agent_id(id, name)")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: tickets, error } = await query;
    if (error) {
      return apiInternalError(error, "agent-support GET");
    }

    return apiJson({ tickets: tickets ?? [] });
  } catch (e) {
    return apiInternalError(e, "agent-support GET");
  }
}
