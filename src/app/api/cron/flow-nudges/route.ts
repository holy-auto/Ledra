import { NextRequest } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { sanitizeAutoActions } from "@/lib/ai/automation/actionCatalog";
import { loadAiAutomationSettings, tenantEligibleForAiAutomation } from "@/lib/ai/automation/policy";
import { shouldNudgeStalledFlows } from "@/lib/ai/automation/orchestrator";
import { processStalledFlowNudges } from "@/lib/cron/flowNudges";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NUDGE_KEY = "inbound_message.auto_flow_nudge";

/**
 * 停滞した見積り会話フローの再促し Cron。見積り詳細待ち (awaiting_quote_detail) のまま
 * ご返信が無いお客様へ、失効前に 1 回だけ「その後いかがでしょうか」の再促しを LINE で送る。
 */
export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  try {
    const admin = createServiceRoleAdmin("cron:flow-nudges — iterates opted-in tenants");

    const lock = await withCronLock(admin, "flow-nudges", 600, async () => {
      // opt-in 候補を安価に絞る (auto_actions にキーが true のテナントのみ)。権威判定は
      // loadAiAutomationSettings + shouldNudgeStalledFlows (enabled 込み) で行う。
      // PostgREST の既定 1000 行上限で取りこぼさないよう tenant_id でキーセットページングする。
      // discovery の失敗はここで throw させ、withCronLock 経由で sendCronFailureAlert に上げる。
      const candidates: string[] = [];
      const PAGE = 1000;
      let after = "";
      for (;;) {
        const { data: rows, error } = await admin
          .from("tenant_ai_automation_settings")
          .select("tenant_id, auto_actions")
          .gt("tenant_id", after)
          .order("tenant_id", { ascending: true })
          .limit(PAGE);
        if (error) throw new Error(`tenant_ai_automation_settings select failed: ${error.message}`);
        const page = (rows as Array<{ tenant_id: string; auto_actions: unknown }> | null) ?? [];
        for (const r of page) {
          if (sanitizeAutoActions(r.auto_actions)[NUDGE_KEY] === true) candidates.push(r.tenant_id);
        }
        if (page.length < PAGE) break;
        after = page[page.length - 1].tenant_id;
      }

      let sent = 0;
      for (const tenantId of candidates) {
        // 1 テナントの失敗が他テナントを止めないよう個別に握る (systemic 失敗は上の discovery で検知)。
        try {
          const settings = await loadAiAutomationSettings(tenantId);
          if (!shouldNudgeStalledFlows(settings)) continue;
          if (!(await tenantEligibleForAiAutomation(admin, tenantId))) continue;
          sent += await processStalledFlowNudges(admin, { tenantId });
        } catch (e) {
          console.error("[cron/flow-nudges] tenant failed:", tenantId, e);
        }
      }
      return sent;
    });

    if (!lock.acquired) {
      return apiJson({ ok: true, skipped: "lock-held" });
    }
    return apiJson({ ok: true, nudges_sent: lock.value });
  } catch (e) {
    await sendCronFailureAlert("flow-nudges", e);
    return apiInternalError("Flow nudges cron failed");
  }
}
