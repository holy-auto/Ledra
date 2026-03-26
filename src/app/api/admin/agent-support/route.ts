import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const admin = getAdminClient();
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

    return NextResponse.json({ tickets: tickets ?? [] });
  } catch (e) {
    return apiInternalError(e, "agent-support GET");
  }
}
