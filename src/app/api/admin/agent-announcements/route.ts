import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("agent_announcements")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return apiInternalError(error, "agent-announcements GET");
    return NextResponse.json({ announcements: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "agent-announcements GET");
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
      .from("agent_announcements")
      .insert({
        title: body.title,
        body: body.body,
        category: body.category ?? "general",
        is_pinned: body.is_pinned ?? false,
        published_at: body.published_at ?? new Date().toISOString(),
        created_by: caller.userId,
      })
      .select()
      .single();

    if (error) return apiInternalError(error, "agent-announcements POST");
    return NextResponse.json({ announcement: data }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent-announcements POST");
  }
}
