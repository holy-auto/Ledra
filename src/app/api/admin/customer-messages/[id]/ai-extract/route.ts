/**
 * POST /api/admin/customer-messages/[id]/ai-extract
 *
 * 既存の inbound メッセージ (LINE / メール / SMS 受信、`customer_messages`
 * テーブル) を 1 件 AI で解析し、予約候補フィールドを抽出する。
 *
 * - 結果は `customer_messages.ai_extracted` jsonb に保存され、再呼び出しで
 *   上書きされる (履歴は customer_messages の created_at + ai_extracted で追える)
 * - 抽出結果は同時にレスポンスでも返すので、UI は保存後すぐ予約フォームに
 *   流し込める
 *
 * LINE webhook 自体は AI を呼ばない設計 (webhook は 200 を即返す必要があるため)。
 * このルートはスタッフの「AI で予約候補を作る」ボタンから能動的に叩かれる。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError, apiPlanLimit, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { extractInboundReservation } from "@/lib/ai/inboundReservationExtract";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const usage = startAiRouteUsage("/api/admin/customer-messages/[id]/ai-extract");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const { id } = await ctx.params;
    if (!id) return apiNotFound("message id is required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_inbound_extract")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 受信メッセージ抽出は Standard プラン以上でご利用いただけます。");
    }

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, extracted: null });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data: message, error: mErr } = await admin
      .from("customer_messages")
      .select("id, body, channel, direction, created_at")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (mErr) return apiInternalError(mErr, "customer-messages ai-extract: load");
    if (!message) return apiNotFound("message not found");
    if (message.direction !== "inbound") {
      return apiOk({ extracted: null, skipped: "送信済みメッセージ (outbound) は抽出対象外です。" });
    }

    const channel =
      message.channel === "line" || message.channel === "email" ? (message.channel as "line" | "email") : "form";

    const result = await extractInboundReservation(
      {
        text: (message.body as string | null) ?? "",
        channel,
        receivedDate: typeof message.created_at === "string" ? (message.created_at as string).slice(0, 10) : undefined,
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    const snapshot = {
      ...result,
      extracted_at: new Date().toISOString(),
    };

    // 保存は ai_extracted カラムへ。未マイグレーション環境では update が
    // PGRST204/42703 で失敗するため、結果はレスポンスで返しつつ警告だけ付与する。
    const { error: upErr } = await admin
      .from("customer_messages")
      .update({ ai_extracted: snapshot })
      .eq("id", id)
      .eq("tenant_id", tenantId);

    const persisted = !isMissingColumnError(upErr);

    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      confidence: typeof result.confidence === "number" ? result.confidence : null,
      meta: { ai: result.ai, intent: result.intent, channel },
    });

    return apiOk({
      ai_disabled: false,
      extracted: snapshot,
      persisted,
      warning: persisted
        ? undefined
        : "customer_messages.ai_extracted カラムが未作成のためレスポンスのみ返しています。",
    });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "customer-messages ai-extract");
  }
}

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}
