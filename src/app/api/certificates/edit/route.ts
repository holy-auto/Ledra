import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";

const certificateEditSchema = z
  .object({
    public_id: z.string().trim().min(1, "public_id は必須です。").max(100),
  })
  .passthrough();

export const runtime = "nodejs";

/** Fields allowed to be edited, with Japanese labels for the audit log */
const EDITABLE_FIELDS: Record<string, string> = {
  customer_name: "顧客名",
  vehicle_info_json: "車両情報",
  content_free_text: "施工内容",
  expiry_value: "有効条件",
  expiry_date: "有効期限",
  warranty_period_end: "保証期間終了日",
  maintenance_date: "メンテナンス実施日",
  warranty_exclusions: "保証除外内容",
  remarks: "備考",
  service_type: "サービス種別",
  coating_products_json: "コーティング剤",
  ppf_coverage_json: "PPF施工範囲",
  maintenance_json: "整備内容",
  body_repair_json: "鈑金塗装内容",
};

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function PUT(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = certificateEditSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const body = parsed.data as Record<string, unknown> & { public_id: string };
    const publicId = body.public_id;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // Fetch current certificate
    const { data: cert, error: fetchError } = await admin
      .from("certificates")
      .select(
        "id, tenant_id, public_id, status, customer_name, vehicle_info_json, content_free_text, expiry_type, expiry_value, expiry_date, warranty_period_end, maintenance_date, warranty_exclusions, remarks, service_type, coating_products_json, ppf_coverage_json, maintenance_json, body_repair_json, current_version",
      )
      .eq("public_id", publicId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (fetchError || !cert) return apiNotFound("証明書が見つかりません。");

    // Build update payload & track changes
    const changes: Array<{ field: string; label: string; old: unknown; new: unknown }> = [];
    const updatePayload: Record<string, unknown> = {};

    for (const [field, label] of Object.entries(EDITABLE_FIELDS)) {
      if (!(field in body)) continue;

      const oldVal = (cert as Record<string, unknown>)[field];
      const newVal = body[field];

      if (!valuesEqual(oldVal, newVal)) {
        changes.push({ field, label, old: oldVal ?? null, new: newVal ?? null });
        updatePayload[field] = newVal;
      }
    }

    if (changes.length === 0) {
      return apiOk({ changed: false, message: "変更はありません。" });
    }

    // Increment version
    const nextVersion = ((cert.current_version as number) ?? 1) + 1;
    updatePayload.current_version = nextVersion;

    // Update certificate
    const { error: updateError } = await admin.from("certificates").update(updatePayload).eq("id", cert.id);

    if (updateError) {
      console.error("certificate update error", updateError);
      return apiInternalError(updateError, "certificate update");
    }

    // Record edit history
    await admin.from("certificate_edit_histories").insert({
      certificate_id: cert.id,
      tenant_id: caller.tenantId,
      edited_by: caller.userId,
      version: nextVersion,
      changes,
    });

    // Also log to audit_logs for general audit trail
    await admin.from("audit_logs").insert({
      tenant_id: caller.tenantId,
      table_name: "certificates",
      record_id: cert.id,
      action: "certificate_edited",
      old_values: Object.fromEntries(changes.map((c) => [c.field, c.old])),
      new_values: Object.fromEntries(changes.map((c) => [c.field, c.new])),
      performed_by: caller.userId,
    });

    return apiOk({
      changed: true,
      version: nextVersion,
      changes_count: changes.length,
    });
  } catch (e) {
    return apiInternalError(e, "certificate edit");
  }
}
