import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { agentInvoiceUpdateSchema } from "@/lib/validations/agent-content";
import { withCaller } from "@/lib/api/withCaller";

export const PUT = withCaller<{ id: string }>(
  async (request, { caller, supabase, params }) => {
    const { id } = params;
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
  },
  { routeName: "admin/agent-invoices/[id] PUT" },
);
