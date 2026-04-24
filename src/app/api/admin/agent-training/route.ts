import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data } = await admin
      .from("agent_training_courses")
      .select(
        "id, title, description, category, content_type, content_url, thumbnail_url, duration_min, is_required, is_published, sort_order, created_at, updated_at",
      )
      .order("sort_order", { ascending: true });
    return apiJson({ courses: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "agent-training GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = await request.json();
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data, error } = await admin
      .from("agent_training_courses")
      .insert({
        title: body.title,
        description: body.description || null,
        category: body.category ?? "basic",
        content_type: body.content_type ?? "video",
        content_url: body.content_url || null,
        thumbnail_url: body.thumbnail_url || null,
        duration_min: body.duration_min || null,
        is_required: body.is_required ?? false,
        is_published: body.is_published ?? true,
        sort_order: body.sort_order ?? 0,
      })
      .select(
        "id, title, description, category, content_type, content_url, thumbnail_url, duration_min, is_required, is_published, sort_order, created_at, updated_at",
      )
      .single();

    if (error) return apiInternalError(error, "agent-training POST");
    return apiJson({ course: data }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent-training POST");
  }
}
