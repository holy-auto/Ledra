import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const body = await request.json();
    const admin = getAdminClient();
    const allowed = ["category_id", "question", "answer", "sort_order", "is_published"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const { data, error } = await admin
      .from("agent_faqs")
      .update(updates)
      .eq("id", id)
      .select("id, category_id, question, answer, sort_order, is_published, created_at, updated_at")
      .single();
    if (error) return apiInternalError(error, "agent-faq PUT");
    return NextResponse.json({ faq: data });
  } catch (e) {
    return apiInternalError(e, "agent-faq PUT");
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = getAdminClient();
    await admin.from("agent_faqs").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiInternalError(e, "agent-faq DELETE");
  }
}
