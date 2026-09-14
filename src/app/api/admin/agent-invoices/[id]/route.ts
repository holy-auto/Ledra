import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { agentInvoiceUpdateSchema } from "@/lib/validations/agent-content";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = await parseJsonBody(request, agentInvoiceUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const admin = createPlatformScopedAdmin("agent-invoices/[id] — platform-wide agent operations (no tenant scope)");
    const updates: Record<string, unknown> = { ...body };

    if (body.status === "issued" && !updates.issued_at) {
      updates.issued_at = new Date().toISOString();
    }
    if (body.status === "paid" && !updates.paid_at) {
      updates.paid_at = new Date().toISOString();
    }

    const { data, error } = await admin
      .from("agent_invoices")
      .update(updates)
      .eq("id", id)
      .select(
        "id, agent_id, period_start, period_end, subtotal, tax_rate, tax_amount, total, status, notes, issued_at, paid_at, created_at, updated_at",
      )
      .single();
    if (error) return apiInternalError(error, "agent-invoices PUT");
    return apiJson({ invoice: data });
  } catch (e) {
    return apiInternalError(e, "agent-invoices PUT");
  }
}
