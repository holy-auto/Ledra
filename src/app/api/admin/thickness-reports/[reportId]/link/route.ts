/**
 * POST   /api/admin/thickness-reports/[reportId]/link   … レポートを車両に手動で紐付け
 * DELETE /api/admin/thickness-reports/[reportId]/link   … 紐付けを解除
 *
 * NexPTG 同期 (POST /api/external/nexptg/sync) は VIN 完全一致でのみ自動紐付けする。
 * VIN が一致しなかったレポート (vehicle_id = null / 「未紐付け」タブ) を、管理画面から
 * 手動で車両に紐付けるための経路。レポート・車両ともに caller のテナント所属を検証する。
 *
 * Body (POST): { vehicle_id: uuid, force?: boolean }
 *   - 既に別車両へ紐付け済みのレポートは、force=true を明示しない限り 409 で拒否する
 *     (誤操作による上書きを防ぐ)。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/parseBody";
import { apiOk, apiUnauthorized, apiForbidden, apiNotFound, apiError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const linkSchema = z.object({
  vehicle_id: z.string().trim().regex(UUID, { message: "無効な車両IDです。" }),
  force: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ reportId: string }> }) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!requireMinRole(caller, "staff")) return apiForbidden();

  const { reportId } = await ctx.params;
  if (!reportId || !UUID.test(reportId)) return apiNotFound("レポートが見つかりません。");

  const parsed = await parseJsonBody(req, linkSchema);
  if (!parsed.ok) return parsed.response;
  const { vehicle_id: vehicleId, force } = parsed.data;

  try {
    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    // レポートが自テナント所属か確認。
    const { data: report, error: reportErr } = await admin
      .from("thickness_reports")
      .select("id, name, external_report_id, vin, vehicle_id")
      .eq("id", reportId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (reportErr) return apiInternalError(reportErr, "thickness link POST: report lookup");
    if (!report) return apiNotFound("レポートが見つかりません。");

    // 紐付け先の車両も自テナント所属か確認。
    const { data: vehicle, error: vehicleErr } = await admin
      .from("vehicles")
      .select("id, maker, model, plate_display")
      .eq("id", vehicleId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (vehicleErr) return apiInternalError(vehicleErr, "thickness link POST: vehicle lookup");
    if (!vehicle) return apiNotFound("指定された車両が見つかりません。");

    // 既に紐付け済みの場合、force なしでは上書きを拒否する (409)。
    if (report.vehicle_id && report.vehicle_id !== vehicleId && !force) {
      return apiError({
        code: "conflict",
        message: "このレポートは既に別の車両に紐付けられています。上書きするには force: true を指定してください。",
        status: 409,
        data: { current_vehicle_id: report.vehicle_id },
      });
    }
    // 同一車両への再紐付けは冪等に成功扱い。
    if (report.vehicle_id === vehicleId) {
      return apiOk({ report_id: report.id, vehicle_id: vehicleId, already_linked: true });
    }

    const { data: updated, error: updateErr } = await admin
      .from("thickness_reports")
      .update({ vehicle_id: vehicleId, updated_at: new Date().toISOString() })
      .eq("id", reportId)
      .eq("tenant_id", tenantId)
      .select("id, vehicle_id")
      .single();
    if (updateErr) return apiInternalError(updateErr, "thickness link POST: update");

    // 車両履歴に監査エントリを記録 (NexPTG 自動紐付けと同じ type で timeline に載せる)。
    await admin.from("vehicle_histories").insert({
      tenant_id: tenantId,
      vehicle_id: vehicleId,
      type: "thickness_measurement",
      title: `膜厚レポートを手動紐付け: ${report.name ?? report.external_report_id}`,
      description: report.vin ? `NexPTG VIN: ${report.vin}（手動紐付け）` : "手動紐付け",
      performed_at: new Date().toISOString(),
    });

    return apiOk({
      report_id: updated.id,
      vehicle_id: updated.vehicle_id,
      vehicle: {
        id: vehicle.id,
        maker: vehicle.maker,
        model: vehicle.model,
        plate_display: vehicle.plate_display,
      },
    });
  } catch (e) {
    return apiInternalError(e, "thickness link POST");
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ reportId: string }> }) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!requireMinRole(caller, "staff")) return apiForbidden();

  const { reportId } = await ctx.params;
  if (!reportId || !UUID.test(reportId)) return apiNotFound("レポートが見つかりません。");

  try {
    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    const { data: report, error: reportErr } = await admin
      .from("thickness_reports")
      .select("id, name, external_report_id, vehicle_id")
      .eq("id", reportId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (reportErr) return apiInternalError(reportErr, "thickness link DELETE: report lookup");
    if (!report) return apiNotFound("レポートが見つかりません。");

    const previousVehicleId = report.vehicle_id as string | null;
    if (!previousVehicleId) {
      // 既に未紐付け。冪等に成功扱い。
      return apiOk({ report_id: report.id, vehicle_id: null, already_unlinked: true });
    }

    const { error: updateErr } = await admin
      .from("thickness_reports")
      .update({ vehicle_id: null, updated_at: new Date().toISOString() })
      .eq("id", reportId)
      .eq("tenant_id", tenantId);
    if (updateErr) return apiInternalError(updateErr, "thickness link DELETE: update");

    // 解除前の車両に対して監査エントリを残す。
    await admin.from("vehicle_histories").insert({
      tenant_id: tenantId,
      vehicle_id: previousVehicleId,
      type: "thickness_measurement",
      title: `膜厚レポートの紐付けを解除: ${report.name ?? report.external_report_id}`,
      description: "手動で紐付けを解除しました。",
      performed_at: new Date().toISOString(),
    });

    return apiOk({ report_id: report.id, vehicle_id: null });
  } catch (e) {
    return apiInternalError(e, "thickness link DELETE");
  }
}
