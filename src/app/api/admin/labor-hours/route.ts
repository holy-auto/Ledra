/**
 * 型式 × 品番 の取付工数マスタ（labor_hour_masters）の一覧・CSV 一括登録・削除。
 * 算出は /api/admin/labor-hours/quote（src/lib/pricing/laborMaster.ts）。
 */
import { z } from "zod";
import { withCaller } from "@/lib/api/withCaller";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { classifyAgainstExisting, normalizeModelCode, parseLaborCsv } from "@/lib/pricing/laborMaster";

export const dynamic = "force-dynamic";

const COLUMNS = "id, model_code, part_key, part_number, label, hours, fixed_price, source_url, updated_at, created_at";
// ponytail: 一覧は上限件数で打ち切る。天井: 1テナント数千行を超えたらページングを付ける。
const LIST_LIMIT = 2000;

export const GET = withCaller(
  async (req, { caller, supabase }) => {
    const model = normalizeModelCode(new URL(req.url).searchParams.get("model_code"));
    let q = supabase
      .from("labor_hour_masters")
      .select(COLUMNS)
      .eq("tenant_id", caller.tenantId)
      .order("model_code")
      .order("part_key")
      .limit(LIST_LIMIT);
    if (model) q = q.eq("model_code", model);
    const { data, error } = await q;
    if (error) return apiInternalError(error, "labor-hours GET");
    return apiJson({ entries: data ?? [], limit: LIST_LIMIT });
  },
  { routeName: "labor-hours GET" },
);

const importSchema = z.object({
  csv: z.string().min(1, "CSV が空です").max(2_000_000),
  // 既存と値が違う行（衝突）を上書きするか。既定は上書きせず衝突として返す
  overwrite: z.boolean().optional().default(false),
});
// ponytail: 既存行の照会を品番キー 200 件ずつに分ける（PostgREST の in() は URL に載るため）。
const LOOKUP_CHUNK = 200;

export const POST = withCaller(
  async (req, { caller }) => {
    const parsed = importSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const { rows, errors } = parseLaborCsv(parsed.data.csv);
    if (rows.length === 0) return apiValidationError(errors[0] ?? "有効な行がありません");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const models = [...new Set(rows.map((r) => r.model_code))];
    const keys = [...new Set(rows.map((r) => r.part_key))];
    const existing = [];
    for (let i = 0; i < keys.length; i += LOOKUP_CHUNK) {
      const { data, error } = await admin
        .from("labor_hour_masters")
        .select("model_code, part_key, hours, fixed_price, part_number, label, source_url")
        .eq("tenant_id", caller.tenantId)
        .in("model_code", models)
        .in("part_key", keys.slice(i, i + LOOKUP_CHUNK));
      if (error) return apiInternalError(error, "labor-hours import lookup");
      existing.push(...(data ?? []));
    }

    const { toInsert, unchanged, metaUpdates, conflicts } = classifyAgainstExisting(rows, existing);
    const toWrite = [...toInsert, ...metaUpdates, ...(parsed.data.overwrite ? conflicts.map((c) => c.row) : [])];
    if (toWrite.length > 0) {
      const now = new Date().toISOString();
      const { error } = await admin.from("labor_hour_masters").upsert(
        toWrite.map((r) => ({ ...r, tenant_id: caller.tenantId, updated_at: now })),
        { onConflict: "tenant_id,model_code,part_key" },
      );
      if (error) return apiInternalError(error, "labor-hours import");
    }
    return apiJson({
      ok: true,
      inserted: toInsert.length,
      updated: parsed.data.overwrite ? conflicts.length : 0,
      unchanged: unchanged.length + metaUpdates.length,
      conflicts: parsed.data.overwrite ? [] : conflicts.map((c) => c.conflict),
      errors,
    });
  },
  { permission: "menu_items:manage", routeName: "labor-hours POST" },
);

const deleteSchema = z.object({ id: z.string().uuid() });

export const DELETE = withCaller(
  async (req, { caller }) => {
    const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError("無効なIDです。");
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { error } = await admin
      .from("labor_hour_masters")
      .delete()
      .eq("id", parsed.data.id)
      .eq("tenant_id", caller.tenantId);
    if (error) return apiInternalError(error, "labor-hours DELETE");
    return apiJson({ ok: true });
  },
  { permission: "menu_items:manage", routeName: "labor-hours DELETE" },
);
