/**
 * POST /api/admin/documents/[id]/quote-feedback
 *
 * 見積もり (doc_type='estimate', status='accepted') が成約したタイミングで、
 * 対応する請求書 (同一顧客 / 90 日以内) の明細と価格差分 (delta) を算出して
 * ログに記録する。将来の見積もり精度改善のための計測 (instrumentation) であり、
 * DB 書き込みは行わない & 失敗しても呼び出し元をブロックしない。
 *
 * RBAC: staff 以上。
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  accepted: z.literal(true),
});

const CORRELATION_DAYS = 90;

interface Line {
  description: string;
  unit_price: number;
  quantity: number;
}

function extractLines(rawItems: unknown): Line[] {
  const out: Line[] = [];
  if (!Array.isArray(rawItems)) return out;
  for (const it of rawItems) {
    if (!it || typeof it !== "object") continue;
    const rec = it as Record<string, unknown>;
    const descRaw =
      typeof rec.description === "string" ? rec.description : typeof rec.name === "string" ? rec.name : "";
    const description = descRaw.trim();
    const unitPrice = typeof rec.unit_price === "number" ? rec.unit_price : 0;
    const quantity = typeof rec.quantity === "number" && rec.quantity > 0 ? rec.quantity : 1;
    const type = typeof rec.type === "string" ? rec.type : "line";
    if (type !== "line") continue;
    if (description && Number.isFinite(unitPrice) && unitPrice > 0) {
      out.push({ description, unit_price: unitPrice, quantity });
    }
  }
  return out;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const { id } = await ctx.params;
    if (!id) return apiNotFound("document id required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) return parsed.response;

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    // ① 対象見積もりを読む (estimate かつ accepted)
    const { data: estimate, error: estErr } = await admin
      .from("documents")
      .select("id, doc_type, status, customer_id, issued_at, total, items_json")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (estErr) return apiInternalError(estErr, "quote-feedback: estimate");
    if (!estimate) return apiNotFound("document not found");

    // estimate 以外 / 未成約は計測対象外だが、呼び出し元はブロックしない (ok を返す)
    if (estimate.doc_type !== "estimate" || estimate.status !== "accepted") {
      return apiOk({ ok: true, matched: false });
    }

    // ② 同一顧客 / 90 日以内の請求書を探す
    let matchedInvoice: { id: string; total: number | null; items_json: unknown } | null = null;
    if (estimate.customer_id && estimate.issued_at) {
      const estTime = Date.parse(estimate.issued_at as string);
      const untilIso = Number.isNaN(estTime)
        ? new Date().toISOString()
        : new Date(estTime + CORRELATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data: invoices } = await admin
        .from("documents")
        .select("id, total, items_json, issued_at")
        .eq("tenant_id", tenantId)
        .eq("doc_type", "invoice")
        .eq("customer_id", estimate.customer_id as string)
        .gte("issued_at", estimate.issued_at as string)
        .lte("issued_at", untilIso)
        .order("issued_at", { ascending: true })
        .limit(1);
      const row = (invoices ?? [])[0] as { id: string; total: number | null; items_json: unknown } | undefined;
      matchedInvoice = row ?? null;
    }

    if (!matchedInvoice) {
      logger.info("quote-feedback: no matching invoice", {
        estimate_id: id,
        tenant_id: tenantId,
      });
      return apiOk({ ok: true, matched: false });
    }

    // ③ 明細ごとの差分を算出 (見積もり明細 → 請求書の同名明細)
    const estLines = extractLines(estimate.items_json);
    const invLines = extractLines(matchedInvoice.items_json);
    const invByName = new Map<string, Line>();
    for (const l of invLines) invByName.set(l.description.trim().toLowerCase(), l);

    const deltas: Array<{
      description: string;
      estimate_unit_price: number;
      invoice_unit_price: number;
      delta: number;
      delta_pct: number | null;
    }> = [];
    for (const e of estLines) {
      const inv = invByName.get(e.description.trim().toLowerCase());
      if (!inv) continue;
      const delta = inv.unit_price - e.unit_price;
      deltas.push({
        description: e.description,
        estimate_unit_price: e.unit_price,
        invoice_unit_price: inv.unit_price,
        delta,
        delta_pct: e.unit_price > 0 ? delta / e.unit_price : null,
      });
    }

    const totalDelta =
      (typeof matchedInvoice.total === "number" ? matchedInvoice.total : 0) -
      (typeof estimate.total === "number" ? (estimate.total as number) : 0);

    // ④ 計測ログ (DB 書き込みなし)
    logger.info("quote-feedback: estimate→invoice deltas", {
      estimate_id: id,
      invoice_id: matchedInvoice.id,
      tenant_id: tenantId,
      total_delta: totalDelta,
      line_deltas: deltas,
    });

    return apiOk({ ok: true, matched: true, line_count: deltas.length });
  } catch (e) {
    return apiInternalError(e, "quote-feedback");
  }
}
