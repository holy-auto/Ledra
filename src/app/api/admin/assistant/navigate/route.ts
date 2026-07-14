/**
 * POST /api/admin/assistant/navigate
 * ナビゲーション補助（自然文 → 開く画面 href）。
 *
 * ナビ補助は低コストかつ全プランで有用なため、ハードなプラン制限は設けない
 * （モデルのみプラン別: Starter=Haiku）。到達先ページのアクセス制御は
 * AdminRouteGuard が担保する。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";
import { resolveNavIntent } from "@/lib/ai/navIntent";
import { fastModelForPlanTier } from "@/lib/ai/client";

const bodySchema = z.object({
  query: z.string().trim().min(1, "検索する内容を入力してください").max(500),
});

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const result = await resolveNavIntent(parsed.data.query, {
      model: fastModelForPlanTier(caller.planTier),
    });

    return apiOk({ href: result.href, reply: result.reply, alternatives: result.alternatives });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
