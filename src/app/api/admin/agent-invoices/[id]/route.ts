import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = await request.json();
    const admin = getAdminClient();
    const allowed = ["status", "issued_at", "paid_at", "notes"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    if (body.status === "issued" && !updates.issued_at) {
      updates.issued_at = new Date().toISOString();
    }
    if (body.status === "paid" && !updates.paid_at) {
      updates.paid_at = new Date().toISOString();
    }

    const { data, error } = await admin.from("agent_invoices").update(updates).eq("id", id).select().single();
    if (error) return apiInternalError(error, "agent-invoices PUT");
    return NextResponse.json({ invoice: data });
  } catch (e) {
    return apiInternalError(e, "agent-invoices PUT");
  }
}
