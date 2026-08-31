/**
 * POST /api/admin/messages/[key]/ai-summary
 *
 * 受信箱スレッドの直近のやり取りを、担当外のスタッフが引き継げるよう AI が要約して返す。
 * **送信はしない** (社内向けの読む要約)。
 *
 * - プラン: ai_inquiry_classify (Standard+) を流用 (AI 返信ドラフトと同じ)
 * - AI 設定が無効 (settings.enabled=false) なら ai_disabled を返す
 * - rate limit は "ai" プリセット
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiInternalError,
  apiPlanLimit,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { generateThreadSummary } from "@/lib/ai/threadSummary";
import { type ReplyDraftTurn } from "@/lib/ai/replyDraft";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { parseThreadKey } from "@/lib/messages/threadKey";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const usage = startAiRouteUsage("/api/admin/messages/[key]/ai-summary");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const { key } = await ctx.params;
    const ref = parseThreadKey(key);
    if (ref.kind === "invalid") return apiValidationError("invalid thread key");
    if (ref.kind === "email") return apiValidationError("メールスレッドはAI要約に未対応です。");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!canUseFeature(caller.planTier, "ai_inquiry_classify")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 会話要約は Standard プラン以上でご利用いただけます。");
    }

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, summary: null });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    // スレッドの表示名と顧客/LINEユーザーを解決。
    let customerName: string | null = null;
    let lineUserId: string | null = null;
    let customerId: string | null = null;
    if (ref.kind === "customer") {
      const { data: c } = await admin
        .from("customers")
        .select("id, name, line_user_id")
        .eq("id", ref.customerId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!c) return apiNotFound("thread not found");
      customerId = c.id as string;
      customerName = (c.name as string | null) ?? null;
      lineUserId = (c.line_user_id as string | null) ?? null;
    } else {
      lineUserId = ref.lineUserId;
      const { data: matched } = await admin
        .from("customers")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .eq("line_user_id", ref.lineUserId)
        .limit(1)
        .maybeSingle();
      if (matched) {
        customerId = matched.id as string;
        customerName = (matched.name as string | null) ?? null;
      }
    }

    // 直近メッセージ (customer_id / line_user_id いずれか、古い順)。
    const turns: ReplyDraftTurn[] = [];
    const col = customerId ? "customer_id" : "line_user_id";
    const val = customerId ?? lineUserId;
    if (val) {
      const { data } = await admin
        .from("customer_messages")
        .select("direction, body, created_at")
        .eq("tenant_id", tenantId)
        .eq(col, val)
        .order("created_at", { ascending: false })
        .limit(40);
      for (const m of (data ?? []).reverse()) {
        turns.push({ direction: m.direction as "inbound" | "outbound", body: (m.body as string) ?? "" });
      }
    }
    if (turns.length === 0) {
      return apiOk({ ai_disabled: false, summary: null, reason: "no_messages" });
    }

    // 店舗名 / 登録車両 (1台に確定できるときだけ)。
    const [tenantRes, vehicleRes] = await Promise.all([
      admin.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
      customerId
        ? admin.from("vehicles").select("maker, model").eq("tenant_id", tenantId).eq("customer_id", customerId).limit(2)
        : Promise.resolve({ data: [] }),
    ]);
    const vehicles = (vehicleRes.data as Array<{ maker: string | null; model: string | null }> | null) ?? [];
    const vehicle =
      vehicles.length === 1
        ? [vehicles[0].maker, vehicles[0].model].filter((s): s is string => !!s && s.trim().length > 0).join(" ")
        : "";

    const result = await generateThreadSummary(
      { turns, customerName, shopName: (tenantRes.data?.name as string | null) ?? null, vehicle: vehicle || null },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    usage.record({
      tenantId,
      userId: caller.userId,
      outcome: result.ai ? "ok" : "error",
      meta: { has_summary: result.summary.length > 0, turns: turns.length },
    });

    return apiOk({
      ai_disabled: false,
      summary: result.summary || null,
      next_action: result.next_action || null,
      ai: result.ai,
    });
  } catch (e) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "messages ai-summary");
  }
}
