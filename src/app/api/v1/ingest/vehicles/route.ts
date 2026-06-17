/**
 * POST /api/v1/ingest/vehicles
 *
 * 基幹ソフト → Ledra への車両情報 Push 取込。
 *
 * Auth:   Authorization: Bearer lk_live_xxxx
 * Scope:  vehicles:write (または '*')
 * Body:   { source_system, records: [{ external_ref, maker, model, ... }] }
 * 冪等性: (tenant_id, source_system, external_ref) で upsert。
 */
import type { NextRequest } from "next/server";
import { apiOk, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { authenticateIngest, dedupeByRef, runIngest, INGEST_SCOPES } from "@/lib/api/ingest";
import { ingestVehiclesSchema } from "@/lib/validations/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const auth = await authenticateIngest(req, INGEST_SCOPES.vehicles);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("JSONボディが不正です。");
  }

  const parsed = ingestVehiclesSchema.safeParse(body);
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
        maker: r.maker ?? null,
        model: r.model ?? null,
        year: r.year ?? null,
        plate_display: r.plate_display ?? null,
        customer_name: r.customer_name ?? null,
        customer_email: r.customer_email ?? null,
        customer_phone_masked: r.customer_phone_masked ?? null,
        notes: r.notes ?? null,
        last_synced_at: now,
      })),
    );

    const result = await runIngest({
      ctx: auth.ctx,
      resource: "vehicles",
      sourceSystem: source_system,
      table: "vehicles",
      rows,
    });

    return apiOk({ result });
  } catch (e) {
    return apiInternalError(e, "v1/ingest/vehicles");
  }
}
