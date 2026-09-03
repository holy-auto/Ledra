import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { resolveCertifiedTemplateForTenant } from "@/lib/manufacturers/certifiedTemplates";
import { enqueueCertificateAnchor } from "@/lib/anchoring/certificateAnchorService";
import { buildCertificateVersionRow, type CertificateVersionRow } from "@/lib/certificates/certificateVersion";
import { logTenantAuditEvent } from "@/lib/audit/tenantLog";
import { mergeMileageOnEdit } from "@/lib/maintenance/mileage";

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
  accessory_json: "用品取付内容",
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
    if (!requirePermission(caller, "certificates:edit")) return apiForbidden();

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
        "id, tenant_id, public_id, status, customer_name, vehicle_info_json, content_free_text, content_preset_json, expiry_type, expiry_value, expiry_date, warranty_period_end, maintenance_date, warranty_exclusions, remarks, service_type, coating_products_json, ppf_coverage_json, maintenance_json, body_repair_json, accessory_json, current_version, manufacturer_id, manufacturer_template_id",
      )
      .eq("public_id", publicId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (fetchError || !cert) return apiNotFound("証明書が見つかりません。");

    // 走行距離は「入れられるが、消せない」(判定は mergeMileageOnEdit に集約)。
    // 差分を取る**前**に正規化する。後ろでやると、履歴 (certificate_edit_histories /
    // certificate_versions) に補完前の値が残り、実際に保存された値とずれる。
    // また「走行距離しか違わない payload」で版だけ上がって再アンカリングが走るのも防ぐ。
    if ("maintenance_json" in body) {
      const merged = mergeMileageOnEdit(
        (cert as Record<string, unknown>).maintenance_json,
        body.maintenance_json ?? {},
      );
      if (!merged.ok) return apiValidationError(merged.error);
      body.maintenance_json = merged.maintenanceJson;
    }

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

    // メーカー指定デザインの切替もここで扱う。null への切替は常に許可
    // (テナント標準デザインに戻す)。値の差し替えはテナントの認定状態を
    // application 側で再確認する。
    if ("manufacturer_template_id" in body) {
      const incoming = body.manufacturer_template_id;
      if (incoming !== null && incoming !== undefined && typeof incoming !== "string") {
        return apiValidationError("manufacturer_template_id の形式が不正です。");
      }
      const newTemplateId = incoming ? String(incoming) : null;
      const oldTemplateId = (cert as Record<string, unknown>).manufacturer_template_id ?? null;
      if (newTemplateId !== oldTemplateId) {
        let newManufacturerId: string | null = null;
        if (newTemplateId) {
          const resolved = await resolveCertifiedTemplateForTenant(caller.tenantId, newTemplateId);
          if (!resolved) {
            return apiForbidden("このメーカーの認定施工店ではないため、指定デザインに切替できません。");
          }
          newManufacturerId = resolved.manufacturer.id;
        }
        updatePayload.manufacturer_template_id = newTemplateId;
        updatePayload.manufacturer_id = newManufacturerId;
        changes.push({
          field: "manufacturer_template_id",
          label: "メーカー指定デザイン",
          old: oldTemplateId,
          new: newTemplateId,
        });
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
    await logTenantAuditEvent(admin, {
      tenantId: caller.tenantId,
      userId: caller.userId,
      action: "certificate_edited",
      table: "certificates",
      recordId: cert.id as string,
      targetPublicId: (cert.public_id as string | null) ?? null,
      extra: {
        old_values: Object.fromEntries(changes.map((c) => [c.field, c.old])),
        new_values: Object.fromEntries(changes.map((c) => [c.field, c.new])),
      },
      req,
    });

    // 内容が変わったので証明書レコードの新しい digest を anchor queue に積む
    // (best-effort fire-and-forget / CERT_RECORD_ANCHOR_ENABLED=false なら no-op / dedup あり)。
    enqueueCertificateAnchor({ tenantId: caller.tenantId, certificateId: cert.id as string }).catch(() => {});

    // ② version-forward (Phase 1): 訂正内容を certificate_versions に不変スナップショットとして追記。
    // 既存の in-place 更新・edit_histories・再アンカは維持(リーダー ~106 箇所は無変更)。
    // best-effort: 失敗しても編集自体はブロックしない(Phase 1 では他が versions に依存していない)。
    try {
      const { count: versionCount } = await admin
        .from("certificate_versions")
        .select("id", { count: "exact", head: true })
        .eq("certificate_id", cert.id);

      const certRecord = cert as Record<string, unknown>;
      const rows: CertificateVersionRow[] = [];
      // 初回訂正時は原本(訂正前)も v(現行版) として残し、版の連続性を保つ。
      if (!versionCount) {
        rows.push(
          buildCertificateVersionRow({
            cert: certRecord,
            certificateId: cert.id as string,
            tenantId: caller.tenantId,
            version: (cert.current_version as number) ?? 1,
            createdBy: caller.userId,
            changeReason: "initial",
          }),
        );
      }
      // 今回の訂正後内容を nextVersion として残す。
      rows.push(
        buildCertificateVersionRow({
          cert: { ...certRecord, ...updatePayload },
          certificateId: cert.id as string,
          tenantId: caller.tenantId,
          version: nextVersion,
          createdBy: caller.userId,
          changeReason: "edit",
        }),
      );

      const { data: insertedVersions, error: versionErr } = await admin
        .from("certificate_versions")
        .insert(rows)
        .select("id, version");
      if (versionErr) {
        console.error("[cert-version] snapshot insert failed (non-fatal)", versionErr);
      } else if (insertedVersions && insertedVersions.length > 0) {
        const latest = insertedVersions.reduce((a, b) => (b.version > a.version ? b : a));
        await admin.from("certificates").update({ current_version_id: latest.id }).eq("id", cert.id);
      }
    } catch (e) {
      console.error("[cert-version] snapshot failed (non-fatal)", e);
    }

    return apiOk({
      changed: true,
      version: nextVersion,
      changes_count: changes.length,
    });
  } catch (e) {
    return apiInternalError(e, "certificate edit");
  }
}
