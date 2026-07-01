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
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { createCustomerResolver } from "@/lib/customers/resolveCustomer";
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
    const { admin, tenantId } = createTenantScopedAdmin(auth.ctx.tenantId);

    // external_ref で重複排除 (後勝ち)。以降の顧客解決/既存参照は 1 車両につき 1 回。
    const deduped = dedupeByRef(records);

    // 上書き防止: 取込済み車両の customer_id を external_ref で事前取得する。
    // runIngest の upsert は行の全カラムを置換するため、既に (手動含め) 連携済みの
    // 車両は再取込でその customer_id を保持する。
    const refs = deduped.map((r) => r.external_ref);
    const existingCustomerByRef = new Map<string, string | null>();
    if (refs.length > 0) {
      const { data: existing } = await admin
        .from("vehicles")
        .select("external_ref, customer_id")
        .eq("tenant_id", tenantId)
        .eq("source_system", source_system)
        .in("external_ref", refs);
      for (const v of existing ?? []) {
        const row = v as { external_ref: string; customer_id: string | null };
        existingCustomerByRef.set(row.external_ref, row.customer_id ?? null);
      }
    }

    // 顧客名寄せ (バルクなので AI 判定はオフ = 決定的マッチのみ)。
    const resolver = await createCustomerResolver(admin, tenantId, { ai: false });

    const rows: Array<Record<string, unknown> & { external_ref: string }> = [];
    for (const r of deduped) {
      // 既存の連携があれば維持。無ければ (customer_name/email/phone から) 解決。
      let customerId = existingCustomerByRef.get(r.external_ref) ?? null;
      if (!customerId) {
        const resolved = await resolver.resolve({
          name: r.customer_name,
          email: r.customer_email,
          phone: r.customer_phone_masked,
        });
        customerId = resolved.customerId;
      }
      rows.push({
        tenant_id: tenantId,
        source_system,
        external_ref: r.external_ref,
        maker: r.maker ?? null,
        model: r.model ?? null,
        year: r.year ?? null,
        plate_display: r.plate_display ?? null,
        customer_id: customerId,
        notes: r.notes ?? null,
        last_synced_at: now,
      });
    }

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
