import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { measurementsPutSchema } from "@/lib/validations/indicated-inspection";
import { withCaller } from "@/lib/api/withCaller";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 指定整備記録簿（完成検査）の測定値 API。 [G5 / Phase 1b]
 *
 *   GET  /api/admin/inspection-records/:id/measurements  … 測定値一覧
 *   PUT  /api/admin/inspection-records/:id/measurements  … 測定値の置換保存（手入力）
 *
 * `:id` の inspection_record が自テナントの完成検査(inspection_type='completion')である
 * ことを検証してから、inspection_measurements を upsert する。外部テスタ取込(Phase 2)は
 * source='imported' で同じテーブルに書き込むため、本 API は source='manual' 固定とする。
 */

const SELECT_COLUMNS =
  "id, field_code, num_value, text_value, unit, judgment, source, device, measured_at, created_at, updated_at";

async function loadCompletionRecord(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  recordId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await admin
    .from("inspection_records")
    .select("id, inspection_type")
    .eq("tenant_id", tenantId)
    .eq("id", recordId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, message: "対象の点検記録が見つかりません。" };
  if ((data as { inspection_type: string }).inspection_type !== "completion") {
    return { ok: false, message: "完成検査以外の記録には測定値を保存できません。" };
  }
  return { ok: true };
}

export const GET = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    try {
      const { id } = params;
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data, error } = await admin
        .from("inspection_measurements")
        .select(SELECT_COLUMNS)
        .eq("tenant_id", caller.tenantId)
        .eq("inspection_record_id", id)
        .order("field_code", { ascending: true });
      if (error) return apiInternalError(error, "inspection measurements GET");
      return apiJson({ measurements: data ?? [] });
    } catch (e) {
      return apiInternalError(e, "inspection measurements GET");
    }
  },
  { routeName: "inspection measurements GET" },
);

export const PUT = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    try {
      const { id } = params;
      const parsed = measurementsPutSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }

      const { admin } = createTenantScopedAdmin(caller.tenantId);

      const rec = await loadCompletionRecord(admin, caller.tenantId, id);
      if (!rec.ok) return apiValidationError(rec.message);

      const now = new Date().toISOString();
      const rows = parsed.data.measurements.map((m) => ({
        tenant_id: caller.tenantId,
        inspection_record_id: id,
        field_code: m.field_code,
        num_value: m.num_value ?? null,
        text_value: m.text_value ?? null,
        unit: m.unit ?? null,
        judgment: m.judgment ?? null,
        source: "manual" as const,
        device: m.device ?? null,
        measured_at: m.measured_at ?? now,
        created_by: caller.userId,
      }));

      // 置換保存: 送られた field_code は upsert、送られなかった既存セルは削除。
      if (rows.length > 0) {
        const { error: upErr } = await admin
          .from("inspection_measurements")
          .upsert(rows, { onConflict: "inspection_record_id,field_code" });
        if (upErr) return apiInternalError(upErr, "inspection measurements upsert");
      }

      const keep = rows.map((r) => r.field_code);
      let del = admin
        .from("inspection_measurements")
        .delete()
        .eq("tenant_id", caller.tenantId)
        .eq("inspection_record_id", id);
      if (keep.length > 0) {
        // 送られた field_code 以外を削除（PostgREST の not-in 構文）
        del = del.not("field_code", "in", `(${keep.map((c) => `"${c}"`).join(",")})`);
      }
      const { error: delErr } = await del;
      if (delErr) return apiInternalError(delErr, "inspection measurements prune");

      const { data, error } = await admin
        .from("inspection_measurements")
        .select(SELECT_COLUMNS)
        .eq("tenant_id", caller.tenantId)
        .eq("inspection_record_id", id)
        .order("field_code", { ascending: true });
      if (error) return apiInternalError(error, "inspection measurements reload");

      return apiJson({ ok: true, measurements: data ?? [] });
    } catch (e) {
      return apiInternalError(e, "inspection measurements PUT");
    }
  },
  { minRole: "staff", routeName: "inspection measurements PUT" },
);
