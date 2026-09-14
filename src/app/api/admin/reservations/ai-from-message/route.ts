/**
 * POST /api/admin/reservations/ai-from-message
 *
 * 受信メッセージ (LINE / メール本文 / 電話文字起こし) を受け取り、
 * 予約フォームへの入力候補を抽出する。
 *
 * 戻り値はクライアントが `/admin/reservations/new` または飛び込み案件
 * (`/admin/jobs/new`) のフォームに流して、人がレビューしてから保存する想定。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiPlanLimit, apiForbidden } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { extractInboundReservation } from "@/lib/ai/inboundReservationExtract";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { loadAiAutomationSettings, resolveFieldPolicy } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const schema = z.object({
  text: z.string().min(1).max(8000),
  channel: z.enum(["line", "email", "phone", "form"]).optional(),
  received_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "received_date は YYYY-MM-DD 形式")
    .optional(),
});

export async function POST(req: NextRequest) {
  const usage = startAiRouteUsage("/api/admin/reservations/ai-from-message");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_inbound_extract")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 受信メッセージ抽出は Standard プラン以上でご利用いただけます。");
    }

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "schema_error" });
      return parsed.response;
    }

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, extracted: null });
    }

    const result = await extractInboundReservation(
      {
        text: parsed.data.text,
        channel: parsed.data.channel,
        receivedDate: parsed.data.received_date,
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    const filter = (key: string, value: string | undefined) => {
      if (value == null) return undefined;
      const policy = resolveFieldPolicy(settings, key, result.confidence);
      return policy === "manual" ? undefined : value;
    };

    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      confidence: result.confidence,
      meta: { ai: result.ai, intent: result.intent, channel: parsed.data.channel ?? null },
    });

    return apiOk({
      ai_disabled: false,
      extracted: {
        customer_name: filter("inbound_message.customer_name", result.customer_name),
        phone: filter("inbound_message.customer_name", result.phone),
        email: filter("inbound_message.customer_name", result.email),
        vehicle: filter("inbound_message.vehicle", result.vehicle),
        scheduled_date: filter("inbound_message.scheduled_date", result.scheduled_date),
        date_text: filter("inbound_message.scheduled_date", result.date_text),
        service: filter("inbound_message.service_request", result.service),
        note: result.note,
        intent: result.intent,
        confidence: result.confidence,
        ai: result.ai,
      },
    });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "reservation ai-from-message");
  }
}
