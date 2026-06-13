/**
 * PATCH /api/admin/job-progress/[id]
 *
 * 請求書 (doc_type='invoice') の進捗ステータス job_status を更新する。
 * status が 'ready' に遷移したら、顧客が LINE 連携済みの場合に引渡待ち
 * 通知を LINE Push で送る (sendMaintenanceLineMessage)。
 *
 * AuthZ: 進捗更新は staff 以上。任意ステージへの設定も staff 以上に許可
 * (フロントの MutationGuard と一致)。テナント境界は createTenantScopedAdmin
 * + 明示的 tenant_id 絞り込みで担保。
 */
import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/parseBody";
import { jobStatusUpdateSchema, type JobStatus } from "@/lib/validations/job-progress";
import { sendMaintenanceLineMessage } from "@/lib/line/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NOTIF_TYPE = "job_ready";

type DocRow = {
  id: string;
  job_status: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  vehicle_info_json: Record<string, unknown> | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function buildVehicleLabel(parts: { maker: string | null; model: string | null; plate: string | null }): string {
  const base = [parts.maker, parts.model].filter(Boolean).join(" ");
  const label = base || "お車";
  return parts.plate ? `${label} (${parts.plate})` : label;
}

/**
 * 'ready' 遷移時の LINE 引渡通知。失敗してもステータス更新は成功扱いにする
 * (LINE 連携が無い / 設定未構成 / 送信失敗は fail-open)。送信可否を返す。
 */
async function notifyReady(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  doc: DocRow,
): Promise<boolean> {
  if (!doc.customer_id) return false;

  const [{ data: customer }, { data: tenant }, vehicleRes] = await Promise.all([
    admin
      .from("customers")
      .select("id, name, line_user_id")
      .eq("tenant_id", tenantId)
      .eq("id", doc.customer_id)
      .maybeSingle<{ id: string; name: string | null; line_user_id: string | null }>(),
    admin.from("tenants").select("name").eq("id", tenantId).maybeSingle<{ name: string | null }>(),
    doc.vehicle_id
      ? admin
          .from("vehicles")
          .select("maker, model, plate_display")
          .eq("tenant_id", tenantId)
          .eq("id", doc.vehicle_id)
          .maybeSingle<{ maker: string | null; model: string | null; plate_display: string | null }>()
      : Promise.resolve({ data: null }),
  ]);

  const lineUserId = customer?.line_user_id ?? null;
  if (!lineUserId) return false;

  const info = doc.vehicle_info_json ?? {};
  const vehicle = (
    vehicleRes as { data: { maker: string | null; model: string | null; plate_display: string | null } | null }
  ).data;
  const vehicleLabel = buildVehicleLabel({
    maker: vehicle?.maker ?? str(info.maker),
    model: vehicle?.model ?? str(info.model),
    plate: vehicle?.plate_display ?? str(info.plate_display) ?? str(info.plate),
  });
  const shopName = str(tenant?.name) ?? "当店";

  const message = `${vehicleLabel} の施工が完了しました。ご都合の良い時間にお引き取りください。— ${shopName}`;

  const ok = await sendMaintenanceLineMessage({ tenantId, lineUserId, lineMessage: message });

  // 送信結果を記録 (sent/failed)。target は請求書 (invoice)。
  await admin.from("notification_logs").insert({
    tenant_id: tenantId,
    type: NOTIF_TYPE,
    target_type: "invoice",
    target_id: doc.id,
    recipient_line_user_id: lineUserId,
    status: ok ? "sent" : "failed",
  });

  return ok;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const { id } = await ctx.params;
    if (!id) return apiNotFound("invoice id required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden("進捗ステータスを更新する権限がありません。");
    }

    const parsed = await parseJsonBody(req, jobStatusUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const nextStatus: JobStatus = parsed.data.status;

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    // 対象請求書を取得 (前ステータスを確認し、'ready' への遷移時のみ通知)。
    const { data: existing, error: fetchErr } = await admin
      .from("documents")
      .select("id, job_status, customer_id, vehicle_id, vehicle_info_json")
      .eq("tenant_id", tenantId)
      .eq("doc_type", "invoice")
      .eq("id", id)
      .maybeSingle<DocRow>();
    if (fetchErr) return apiInternalError(fetchErr, "admin/job-progress PATCH fetch");
    if (!existing) return apiNotFound("対象の請求書が見つかりません。");

    const wasReady = existing.job_status === "ready";

    const { data: updated, error: updErr } = await admin
      .from("documents")
      .update({ job_status: nextStatus })
      .eq("tenant_id", tenantId)
      .eq("doc_type", "invoice")
      .eq("id", id)
      .select("id, job_status")
      .maybeSingle<{ id: string; job_status: string }>();
    if (updErr) return apiInternalError(updErr, "admin/job-progress PATCH update");
    if (!updated) return apiNotFound("対象の請求書が見つかりません。");

    // 'ready' に「新規に」遷移したときだけ LINE 通知 (再保存で再送しない)。
    let lineNotified = false;
    if (nextStatus === "ready" && !wasReady) {
      lineNotified = await notifyReady(admin, tenantId, existing);
    }

    return apiJson({ ok: true, id: updated.id, job_status: updated.job_status, line_notified: lineNotified });
  } catch (e) {
    return apiInternalError(e, "admin/job-progress PATCH");
  }
}
