/**
 * POST /api/admin/certificates/voice-memo
 *
 * 音声メモ → 証明書ドラフトを返す。クライアント側で Web Speech API による
 * 書き起こしを済ませた transcript を受け取り、Anthropic Haiku で構造化する。
 *
 * minPlan: standard 以上 (ai_draft 機能と同条件)。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { reformatVoiceMemo } from "@/lib/ai/voiceMemoReformat";
import { fastModelForPlanTier } from "@/lib/ai/client";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const schema = z.object({
  transcript: z.string().trim().min(1, "transcript が空です").max(5000, "5000 文字までに収めてください"),
  service_type: z.string().trim().max(100).optional(),
  vehicle_hint: z.string().trim().max(200).optional(),
  customer_hint: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const tier = normalizePlanTier(caller.planTier);
    if (!canUseFeature(tier, "ai_draft")) {
      return apiForbidden("AI ドラフト機能は Standard プラン以上で利用できます。");
    }

    const limited = await checkRateLimit(req, "ai", `voice-memo:${caller.tenantId}`);
    if (limited) return limited;

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const draft = await reformatVoiceMemo(
      {
        transcript: parsed.data.transcript,
        serviceType: parsed.data.service_type,
        vehicleHint: parsed.data.vehicle_hint,
        customerHint: parsed.data.customer_hint,
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    if (!draft) {
      return apiOk({ ok: false, reason: "ai_unavailable" });
    }

    return apiOk({ ok: true, draft });
  } catch (e: unknown) {
    return apiInternalError(e, "voice-memo");
  }
}
