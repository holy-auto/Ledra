import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError, sanitizeErrorMessage } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("agent_notifications")
      .select("*, agents(name)")
      .order("created_at", { ascending: false });

    if (error) return apiInternalError(error, "agent-notifications");

    const notifications = (data ?? []).map((n: any) => ({
      ...n,
      agent_name: n.agents?.name ?? "",
      agents: undefined,
    }));

    return NextResponse.json({ notifications });
  } catch (e) {
    return apiInternalError(e, "agent-notifications");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = await request.json();
    const admin = getAdminClient();

    const { data, error } = await admin
      .from("agent_notifications")
      .insert({
        agent_id: body.agent_id,
        user_id: caller.userId,
        type: body.type ?? "info",
        title: body.title,
        body: body.body,
        link: body.link || null,
        is_read: false,
      })
      .select()
      .single();

    if (error) return apiInternalError(error, "agent-notifications");
    return NextResponse.json({ notification: data }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent-notifications");
  }
}
