/**
 * POST /api/v1/ingest/work-history
 *
 * 基幹ソフト → Ledra への過去の作業履歴 Push 取込 (vehicle_histories)。
 *
 * Auth:   Authorization: Bearer lk_live_xxxx
 * Scope:  work_history:write (または '*')
 * Body:   { source_system, records: [{ external_ref, vehicle_external_ref, type, title, ... }] }
 *
 * vehicle_external_ref で既存車両 (同一 source_system で取込済み) に紐づける。
 * 解決できなかったレコードは failed として集計し、unresolved_vehicles で返す。
 * 冪等性: (tenant_id, source_system, external_ref) で upsert。
 */
import type { NextRequest } from "next/server";
import { apiOk, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { authenticateIngest, dedupeByRef, runIngest, INGEST_SCOPES } from "@/lib/api/ingest";
import { ingestWorkHistorySchema } from "@/lib/validations/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const auth = await authenticateIngest(req, INGEST_SCOPES.work_history);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("JSONボディが不正です。");
  }

  const parsed = ingestWorkHistorySchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
  }

  const { source_system, records } = parsed.data;
  const now = new Date().toISOString();

  try {
    const { admin, tenantId } = createTenantScopedAdmin(auth.ctx.tenantId);

    // vehicle_external_ref → vehicle_id を解決 (同一 source_system で取込済みの車両)。
    const vehicleRefs = [...new Set(records.map((r) => r.vehicle_external_ref))];
    const { data: vehicles, error: vErr } = await admin
      .from("vehicles")
      .select("id, external_ref")
      .eq("tenant_id", tenantId)
      .eq("source_system", source_system)
      .in("external_ref", vehicleRefs);
    if (vErr) return apiInternalError(vErr, "v1/ingest/work-history vehicle lookup");

    const vehicleMap = new Map(
      (vehicles ?? []).map((v) => [(v as { external_ref: string }).external_ref, (v as { id: string }).id]),
    );

    let unresolved = 0;
    const resolvable: Array<Record<string, unknown> & { external_ref: string }> = [];
    for (const r of records) {
      const vehicleId = vehicleMap.get(r.vehicle_external_ref);
      if (!vehicleId) {
        unresolved++;
        continue;
      }
      resolvable.push({
        tenant_id: tenantId,
        source_system,
        external_ref: r.external_ref,
        vehicle_id: vehicleId,
        type: r.type,
        title: r.title,
        description: r.description ?? null,
        performed_at: r.performed_at ?? now,
        last_synced_at: now,
      });
    }

    const rows = dedupeByRef(resolvable);

    const result = await runIngest({
      ctx: auth.ctx,
      resource: "work_history",
      sourceSystem: source_system,
      table: "vehicle_histories",
      rows,
      preFailed: unresolved,
      preFailedReason:
        unresolved > 0 ? `${unresolved}件の vehicle_external_ref が未解決のため取込されませんでした。` : undefined,
    });

    return apiOk({ result, unresolved_vehicles: unresolved });
  } catch (e) {
    return apiInternalError(e, "v1/ingest/work-history");
  }
}
