import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiInternalError,
  apiNotFound,
  apiValidationError,
} from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { payVehicleReportRevenueShare } from "@/lib/vehicleReport/payout";

export const dynamic = "force-dynamic";

const actionSchema = z.object({ action: z.enum(["approve", "pay", "cancel"]) });

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/platform/report-revenue/<id>
 * Body: { action: "approve" | "pay" | "cancel" }
 *
 * approve: pending → approved (human gate before any money moves)
 * pay:     approved → Stripe transfer (connect-webhook settles to paid)
 * cancel:  pending / approved → cancelled
 *
 * Mirrors the agent-commission payout gate.
 */
export async function PATCH(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = await parseJsonBody(request, actionSchema);
    if (!parsed.ok) return parsed.response;
    const { action } = parsed.data;

    const admin = createPlatformScopedAdmin("report-revenue — approve/pay/cancel payout");
    const { data: share } = await admin
      .from("vehicle_report_revenue_shares")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (!share) return apiNotFound("還元レコードが見つかりません。");

    if (action === "approve") {
      if (share.status !== "pending") return apiValidationError("承認できるのは pending のみです。");
      await admin
        .from("vehicle_report_revenue_shares")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .eq("id", id);
      return apiJson({ ok: true, status: "approved" });
    }

    if (action === "cancel") {
      if (!["pending", "approved"].includes(share.status as string)) {
        return apiValidationError("キャンセルできるのは pending / approved のみです。");
      }
      await admin
        .from("vehicle_report_revenue_shares")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id);
      return apiJson({ ok: true, status: "cancelled" });
    }

    // action === "pay": approved のみ。webhook が paid へ確定する。
    const result = await payVehicleReportRevenueShare(admin, id);
    if (!result.ok) {
      const msg: Record<string, string> = {
        not_approved: "送金できるのは承認済み(approved)の還元のみです。",
        tenant_not_onboarded: "施工店の Stripe Connect 連携が未完了です。",
        zero_amount: "送金額が 0 円です。",
        not_found: "還元レコードが見つかりません。",
      };
      return apiValidationError(msg[result.reason ?? ""] ?? "送金に失敗しました。");
    }
    return apiJson({ ok: true, status: "approved", transferId: result.transferId });
  } catch (e) {
    return apiInternalError(e, "report-revenue PATCH");
  }
}
