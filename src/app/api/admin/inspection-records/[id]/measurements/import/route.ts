import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { measurementsPutSchema } from "@/lib/validations/indicated-inspection";
import { loadCompletionRecord } from "@/lib/inspection/loadCompletionRecord";
import { withCaller } from "@/lib/api/withCaller";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 外部テスタ測定値の取込 API。 [G5 / Phase 2 サーバ土台]
 *
 *   POST /api/admin/inspection-records/:id/measurements/import
 *
 * 手入力 PUT（置換保存・source='manual'）に対し、本 API は外部取込専用で:
 * - 来歴 `source='imported'` を固定（手入力と区別。DECISION_LOG 2026-09-24）。
 * - **マージ書き込み**（送られた field_code のみ upsert、未送信の既存セルは消さない）。
 *   テスタ出力が様式の一部のみでも、手入力済みの他セルを巻き込んで消さないため。
 * - `device`（テスタ名/型番）・`measured_at`（計測時刻）を保持する。
 *
 * ボディは手入力 PUT と同じ `measurementsPutSchema`（field_code はカタログ既知のみ、重複不可、
 * 値種別・単位の整合を検証）。取込元（CSV/API/OSS 連携）は呼び出し側で正規化し、本 API には
 * 正準 field_code の配列で渡す。UI/連携方式は仕様確定後に追加する。
 */

const SELECT_COLUMNS =
  "id, field_code, num_value, text_value, unit, judgment, source, device, measured_at, created_at, updated_at";

export const POST = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    try {
      const { id } = params;
      const parsed = measurementsPutSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      if (parsed.data.measurements.length === 0) {
        return apiValidationError("取込む測定値がありません。");
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
        source: "imported" as const,
        device: m.device ?? null,
        measured_at: m.measured_at ?? now,
        created_by: caller.userId,
      }));

      // マージ書き込み: 送られた field_code のみ upsert。未送信の既存セルは削除しない（手入力分を保全）。
      const { error: upErr } = await admin
        .from("inspection_measurements")
        .upsert(rows, { onConflict: "inspection_record_id,field_code" });
      if (upErr) return apiInternalError(upErr, "inspection measurements import upsert");

      const { data, error } = await admin
        .from("inspection_measurements")
        .select(SELECT_COLUMNS)
        .eq("tenant_id", caller.tenantId)
        .eq("inspection_record_id", id)
        .order("field_code", { ascending: true });
      if (error) return apiInternalError(error, "inspection measurements import reload");

      return apiJson({ ok: true, imported: rows.length, measurements: data ?? [] });
    } catch (e) {
      return apiInternalError(e, "inspection measurements import POST");
    }
  },
  { minRole: "staff", routeName: "inspection measurements import POST" },
);
