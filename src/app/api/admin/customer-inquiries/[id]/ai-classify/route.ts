/**
 * POST /api/admin/customer-inquiries/[id]/ai-classify
 *
 * 既存問い合わせ (`customer_inquiries`) を AI で分類し、推奨カテゴリ /
 * 優先度 / 返信下書きを返す。フィールド単位ポリシーで個別に on/off 可能。
 *
 * 戻り値はクライアントが PATCH /api/admin/customer-inquiries に流して
 * status / 返信下書きを更新する想定。本ルート自体は読み取り専用。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError, apiPlanLimit, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { classifyInquiry } from "@/lib/ai/inquiryClassify";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { loadAiAutomationSettings, resolveFieldPolicy, isSourceAllowed } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const usage = startAiRouteUsage("/api/admin/customer-inquiries/[id]/ai-classify");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const { id } = await ctx.params;
    if (!id) return apiNotFound("inquiry id is required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_inquiry_classify")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 問い合わせ分類は Standard プラン以上でご利用いただけます。");
    }

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, classification: null });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data: inquiry, error } = await admin
      .from("customer_inquiries")
      .select("id, subject, message, customer_name, customer_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) return apiInternalError(error, "inquiry ai-classify: read");
    if (!inquiry) return apiNotFound("inquiry not found");

    // 過去施工履歴ソースを許可されている場合のみ取得
    let history: { name?: string; last_certificate_label?: string; days_since_last_visit?: number | null } | undefined;
    // customer_inquiries に customer_email 列は無い。顧客は customer_id で直接引く
    if (isSourceAllowed(settings, "customer_history") && inquiry.customer_id) {
      const { data: customer } = await admin
        .from("customers")
        .select("id, name")
        .eq("id", inquiry.customer_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (customer) {
        const { data: cert } = await admin
          .from("certificates")
          .select("service_type, created_at")
          .eq("customer_id", customer.id)
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        history = {
          name: customer.name as string,
          last_certificate_label: (cert?.service_type as string | undefined) ?? undefined,
          days_since_last_visit: cert?.created_at
            ? Math.floor((Date.now() - Date.parse(cert.created_at as string)) / 86400000)
            : null,
        };
      }
    }

    const result = await classifyInquiry(
      {
        subject: inquiry.subject ?? "",
        message: inquiry.message ?? "",
        customerHistory: history ?? (inquiry.customer_name ? { name: inquiry.customer_name } : undefined),
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    const categoryPolicy = resolveFieldPolicy(settings, "inquiry.category", result.confidence);
    const priorityPolicy = resolveFieldPolicy(settings, "inquiry.priority", result.confidence);
    const replyPolicy = resolveFieldPolicy(settings, "inquiry.draft_reply", result.confidence);

    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      confidence: result.confidence,
      meta: { ai: result.ai, category: result.category, priority: result.priority },
    });

    return apiOk({
      ai_disabled: false,
      classification: {
        category: categoryPolicy === "manual" ? null : result.category,
        priority: priorityPolicy === "manual" ? null : result.priority,
        draft_reply: replyPolicy === "manual" ? "" : result.draft_reply,
        reason: result.reason,
        confidence: result.confidence,
        ai: result.ai,
        policies: {
          "inquiry.category": categoryPolicy,
          "inquiry.priority": priorityPolicy,
          "inquiry.draft_reply": replyPolicy,
        },
      },
    });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "inquiry ai-classify");
  }
}
