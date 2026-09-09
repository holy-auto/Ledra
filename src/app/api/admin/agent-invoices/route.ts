import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { parsePagination } from "@/lib/api/pagination";
import { agentInvoiceCreateSchema } from "@/lib/validations/agent-content";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("agent-invoices — platform-wide agent operations (no tenant scope)");
    const p = parsePagination(request, { defaultPerPage: 50, maxPerPage: 200 });

    let query = admin
      .from("agent_invoices")
      .select(
        "id, agent_id, period_start, period_end, subtotal, tax_rate, tax_amount, total, status, notes, issued_at, paid_at, created_at, updated_at, agents(name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (p.page > 0) query = query.range(p.from, p.to);
    else query = query.limit(p.perPage);

    const { data, count } = await query;

    const invoices = (data ?? []).map((inv: any) => ({
      ...inv,
      agent_name: inv.agents?.name ?? "",
      agents: undefined,
    }));

    return apiJson({
      invoices,
      page: p.page,
      per_page: p.perPage,
      total: count ?? null,
    });
  } catch (e) {
    return apiInternalError(e, "agent-invoices GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = await parseJsonBody(request, agentInvoiceCreateSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const admin = createPlatformScopedAdmin("agent-invoices — platform-wide agent operations (no tenant scope)");

    const subtotal = body.subtotal ?? 0;
    const taxRate = body.tax_rate ?? 10;
    const taxAmount = Math.round((subtotal * taxRate) / 100);
    const total = subtotal + taxAmount;

    const { data: invoice, error: invErr } = await admin
      .from("agent_invoices")
      .insert({
        agent_id: body.agent_id,
        period_start: body.period_start,
        period_end: body.period_end,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        status: body.status ?? "draft",
        notes: body.notes ?? null,
      })
      .select(
        "id, agent_id, period_start, period_end, subtotal, tax_rate, tax_amount, total, status, notes, issued_at, paid_at, created_at, updated_at",
      )
      .single();

    if (invErr) return apiInternalError(invErr, "agent-invoices POST");

    // Insert line items if provided
    if (body.lines && body.lines.length > 0) {
      const lines = body.lines.map((line) => ({
        invoice_id: invoice.id,
        description: line.description,
        quantity: line.quantity ?? 1,
        unit_price: line.unit_price ?? 0,
        amount: line.amount ?? (line.quantity ?? 1) * (line.unit_price ?? 0),
      }));
      await admin.from("agent_invoice_lines").insert(lines);
    }

    return apiJson({ invoice }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent-invoices POST");
  }
}
