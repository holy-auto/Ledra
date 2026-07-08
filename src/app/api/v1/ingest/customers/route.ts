/**
 * POST /api/v1/ingest/customers
 *
 * 基幹ソフト → Ledra への顧客情報 Push 取込。
 *
 * Auth:   Authorization: Bearer lk_live_xxxx
 * Scope:  customers:write (または '*')
 * Body:   { source_system, records: [{ external_ref, name, ... }] }
 * 冪等性: (tenant_id, source_system, external_ref) で upsert。
 */
import type { NextRequest } from "next/server";
import { apiOk, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { authenticateIngest, dedupeByRef, runIngest, INGEST_SCOPES } from "@/lib/api/ingest";
import { ingestCustomersSchema } from "@/lib/validations/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const auth = await authenticateIngest(req, INGEST_SCOPES.customers);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("JSONボディが不正です。");
  }

  const parsed = ingestCustomersSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
  }

  const { source_system, records } = parsed.data;
  const now = new Date().toISOString();

  try {
    const rows = dedupeByRef(
      records.map((r) => ({
        tenant_id: auth.ctx.tenantId,
        source_system,
        external_ref: r.external_ref,
        name: r.name,
        name_kana: r.name_kana ?? null,
        email: r.email ?? null,
        phone: r.phone ?? null,
        postal_code: r.postal_code ?? null,
        address: r.address ?? null,
        note: r.note ?? null,
        customer_type: r.customer_type ?? "individual",
        corporate_number: r.corporate_number ?? null,
        invoice_registration_number: r.invoice_registration_number ?? null,
        billing_cycle: r.billing_cycle ?? null,
        last_synced_at: now,
      })),
    );

    const result = await runIngest({
      ctx: auth.ctx,
      resource: "customers",
      sourceSystem: source_system,
      table: "customers",
      rows,
    });

    return apiOk({ result });
  } catch (e) {
    return apiInternalError(e, "v1/ingest/customers");
  }
}
