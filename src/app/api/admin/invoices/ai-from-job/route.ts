/**
 * POST /api/admin/invoices/ai-from-job
 *
 * 案件 (reservation) から請求書下書きを生成し、`/api/admin/invoices` の
 * POST がそのまま受け取れる payload 形 (items / tax_rate / recipient_name /
 * note / vehicle_id / customer_id) で返す。
 *
 * クライアント側 (invoices/new フォーム) は受け取った draft をフォームに
 * 流し込むだけで「下書き保存」可能。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { generateInvoiceFromJob } from "@/lib/ai/invoiceFromJob";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const schema = z.object({
  reservation_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) return parsed.response;

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      return apiOk({ ai_disabled: true, draft: null });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data: reservation, error: rErr } = await admin
      .from("reservations")
      .select("id, customer_id, vehicle_id, menu_items_json, estimated_amount, title")
      .eq("id", parsed.data.reservation_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (rErr) return apiInternalError(rErr, "invoice ai-from-job: reservation");
    if (!reservation) return apiNotFound("reservation not found");

    const [customerRes, vehicleRes] = await Promise.all([
      reservation.customer_id
        ? admin.from("customers").select("name, kind").eq("id", reservation.customer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      reservation.vehicle_id
        ? admin
            .from("vehicles")
            .select("maker, model, plate_display")
            .eq("id", reservation.vehicle_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const customer = customerRes.data as { name?: string; kind?: string } | null;

    const menuItems = extractMenuItems(reservation.menu_items_json);
    const draft = await generateInvoiceFromJob({
      customerName: customer?.name ?? null,
      customerType: customer?.kind === "corporate" ? "corporate" : "individual",
      vehicle: vehicleRes.data as { maker?: string; model?: string; plate_display?: string } | null,
      menuItems,
      estimatedAmount: reservation.estimated_amount,
      serviceCategory: reservation.title,
    });

    return apiOk({
      ai_disabled: false,
      draft: {
        customer_id: reservation.customer_id,
        vehicle_id: reservation.vehicle_id,
        items: draft.items,
        tax_rate: draft.tax_rate,
        recipient_name: draft.recipient_name,
        note: draft.note,
        ai: draft.ai,
        confidence: draft.confidence,
      },
    });
  } catch (e: unknown) {
    return apiInternalError(e, "invoice ai-from-job");
  }
}

function extractMenuItems(raw: unknown): Array<{ name: string; unit_price?: number | null; quantity?: number | null }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ name: string; unit_price?: number | null; quantity?: number | null }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!name) continue;
    out.push({
      name,
      unit_price: typeof rec.unit_price === "number" ? rec.unit_price : typeof rec.price === "number" ? rec.price : null,
      quantity: typeof rec.quantity === "number" ? rec.quantity : 1,
    });
  }
  return out;
}
