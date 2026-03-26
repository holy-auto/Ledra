import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: RouteContext) {
  const limited = await checkRateLimit(request, "general");
  if (limited) return limited;

  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = await request.json();
    const admin = getAdminClient();

    const updates: Record<string, unknown> = {};
    const allowed = ["title", "description", "category_id", "version", "is_pinned", "is_published"];
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return apiValidationError("no fields to update");
    }

    const { data, error } = await admin
      .from("agent_materials")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return apiInternalError(error, "agent-materials PUT");
    }

    return NextResponse.json({ material: data });
  } catch (e) {
    return apiInternalError(e, "agent-materials PUT");
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const limited = await checkRateLimit(_request, "general");
  if (limited) return limited;

  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const admin = getAdminClient();

    // Get storage path before deleting
    const { data: material } = await admin
      .from("agent_materials")
      .select("storage_path")
      .eq("id", id)
      .single();

    if (material?.storage_path) {
      await admin.storage.from("agent-materials").remove([material.storage_path]);
    }

    const { error } = await admin
      .from("agent_materials")
      .delete()
      .eq("id", id);

    if (error) {
      return apiInternalError(error, "agent-materials DELETE");
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiInternalError(e, "agent-materials DELETE");
  }
}
