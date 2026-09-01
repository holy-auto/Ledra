/**
 * POST /api/admin/square/orders/[id]/ai-link
 *
 * Square 注文の `customer_id` を AI ファジーマッチで提案する。
 * 既存の `/admin/square/orders/[id]/link` (PUT) は確定値を保存する用途、
 * こちらは「保存前の候補表示」用。
 *
 * リクエストボディは不要 (Square 注文の name/phone/email を内部で取得する)。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError, apiPlanLimit, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { fuzzyMatchCustomer } from "@/lib/ai/customerFuzzyMatch";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { loadAiAutomationSettings, resolveFieldPolicy, isSourceAllowed } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const usage = startAiRouteUsage("/api/admin/square/orders/[id]/ai-link");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const { id } = await ctx.params;
    if (!id) return apiNotFound("order id is required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_master_normalize")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("Square 顧客ファジーマッチは Starter プラン以上でご利用いただけます。");
    }

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, match: null });
    }
    if (!isSourceAllowed(settings, "customer_history")) {
      usage.record({
        tenantId: caller.tenantId,
        userId: caller.userId,
        outcome: "ai_disabled",
        meta: { reason: "source_disabled" },
      });
      return apiOk({ ai_disabled: false, match: null, skipped: "customer_history source disabled" });
    }
    const policy = resolveFieldPolicy(settings, "master_data.customer_fuzzy_match");
    if (policy === "manual") {
      usage.record({
        tenantId: caller.tenantId,
        userId: caller.userId,
        outcome: "ai_disabled",
        meta: { reason: "policy_manual" },
      });
      return apiOk({ ai_disabled: false, match: null, skipped: "policy is manual" });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    // square_orders は customer name/phone/email を持たない。
    // 既に紐付け済みなら customer_id 経由でマスタを引いて query にする。
    // 未紐付けなら raw_json (Square API レスポンス全体) から fulfillments の
    // customer 情報を救い上げる。
    const { data: order, error: oErr } = await admin
      .from("square_orders")
      .select("id, customer_id, square_customer_id, raw_json")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (oErr) return apiInternalError(oErr, "square ai-link: order");
    if (!order) return apiNotFound("square order not found");

    const query = extractQueryFromRawJson(order.raw_json);

    // 自テナント顧客マスタ
    const { data: candidates } = await admin
      .from("customers")
      .select("id, name, name_kana, phone, email")
      .eq("tenant_id", tenantId)
      .limit(500);

    const result = await fuzzyMatchCustomer(
      {
        query,
        candidates: (candidates ?? []) as Array<{
          id: string;
          name: string;
          name_kana: string | null;
          phone: string | null;
          email: string | null;
        }>,
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      confidence: result.confidence,
      meta: { ai: result.ai, method: result.method, has_best: !!result.best },
    });

    return apiOk({
      ai_disabled: false,
      match: {
        best: result.best
          ? {
              customer_id: result.best.candidate.id,
              name: result.best.candidate.name,
              score: result.best.score,
              reasons: result.best.reasons,
            }
          : null,
        alternatives: result.alternatives.map((a) => ({
          customer_id: a.candidate.id,
          name: a.candidate.name,
          score: a.score,
          reasons: a.reasons,
        })),
        confidence: result.confidence,
        method: result.method,
        ai: result.ai,
      },
    });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "square ai-link");
  }
}

/**
 * Square Orders API のレスポンス本体 (raw_json) から、顧客名・電話・メールを
 * 救い上げる。Square のスキーマは可変なので best-effort で複数パスを試す。
 */
function extractQueryFromRawJson(raw: unknown): { name: string | null; phone: string | null; email: string | null } {
  if (!raw || typeof raw !== "object") return { name: null, phone: null, email: null };
  const r = raw as Record<string, unknown>;
  let name: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;

  const fulfillments = Array.isArray(r.fulfillments) ? (r.fulfillments as Array<Record<string, unknown>>) : [];
  for (const f of fulfillments) {
    const fr = (f as Record<string, unknown>).pickup_details ?? (f as Record<string, unknown>).delivery_details;
    if (fr && typeof fr === "object") {
      const recipient = (fr as Record<string, unknown>).recipient as Record<string, unknown> | undefined;
      if (recipient) {
        if (!name && typeof recipient.display_name === "string") name = recipient.display_name as string;
        if (!phone && typeof recipient.phone_number === "string") phone = recipient.phone_number as string;
        if (!email && typeof recipient.email_address === "string") email = recipient.email_address as string;
      }
    }
  }
  if (!email && typeof r.buyer_email_address === "string") email = r.buyer_email_address as string;

  return { name, phone, email };
}
