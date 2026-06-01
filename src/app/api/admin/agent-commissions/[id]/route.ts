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
import { payAgentCommission } from "@/lib/agents/payout";

export const dynamic = "force-dynamic";

const actionSchema = z.object({ action: z.enum(["approve", "pay", "cancel"]) });

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/agent-commissions/<id>
 * Body: { action: "approve" | "pay" | "cancel" }
 *
 * approve: pending → approved
 * pay:     approved → Stripe transfer (webhook settles to paid). 壁3 gate.
 * cancel:  pending/approved → cancelled
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

    const admin = createPlatformScopedAdmin("agent-commissions — approve/pay/cancel payout");
    const { data: commission } = await admin.from("agent_commissions").select("id, status").eq("id", id).maybeSingle();
    if (!commission) return apiNotFound("コミッションが見つかりません。");

    if (action === "approve") {
      if (commission.status !== "pending") {
        return apiValidationError("承認できるのは未払い(pending)のコミッションのみです。");
      }
      const { error } = await admin
        .from("agent_commissions")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return apiInternalError(error, "agent-commissions approve");
      return apiJson({ ok: true, status: "approved" });
    }

    if (action === "cancel") {
      if (!["pending", "approved"].includes(commission.status as string)) {
        return apiValidationError("キャンセルできるのは pending / approved のみです。");
      }
      const { error } = await admin
        .from("agent_commissions")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return apiInternalError(error, "agent-commissions cancel");
      return apiJson({ ok: true, status: "cancelled" });
    }

    // action === "pay"
    const result = await payAgentCommission(admin, id);
    if (!result.ok) {
      const messages: Record<string, string> = {
        not_approved: "送金できるのは承認済み(approved)のコミッションのみです。",
        agent_not_onboarded: "代理店の Stripe 送金設定（Connect オンボーディング）が未完了です。",
        zero_amount: "金額が 0 のため送金できません。",
        not_found: "コミッションが見つかりません。",
      };
      return apiValidationError(messages[result.reason ?? ""] ?? `送金に失敗しました（${result.reason}）。`);
    }
    return apiJson({
      ok: true,
      status: "approved",
      transfer_id: result.transferId,
      message: "送金を開始しました。着金後に支払い済みへ自動更新されます。",
    });
  } catch (e) {
    return apiInternalError(e, "agent-commissions PATCH");
  }
}
