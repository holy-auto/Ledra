/**
 * POST   /api/admin/academy/lessons/[id]/complete  完了マーク
 * DELETE /api/admin/academy/lessons/[id]/complete  完了取り消し
 *
 * - 公開済みレッスンに対してのみ可能
 * - 自分のレッスンは完了不可 (自演防止)
 * - Free は intro レッスンのみ完了可
 * - スコアは level に応じて自動付与 (intro=10, basic=20, standard=30, pro=50)
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiNotFound, apiForbidden } from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { scoreForLevel } from "@/lib/academy/scoring";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data: lesson } = await supabase
      .from("academy_lessons")
      .select("id, status, level, author_user_id")
      .eq("id", id)
      .maybeSingle();

    if (!lesson) return apiNotFound("レッスンが見つかりません");
    if (lesson.status !== "published") return apiForbidden("公開済みレッスンのみ完了できます");
    if (lesson.author_user_id === caller.userId) return apiForbidden("自身のレッスンは完了できません");

    if (lesson.level !== "intro" && !canUseFeature(caller.planTier, "academy_know_how")) {
      return apiForbidden("このレッスンの完了には Starter プラン以上が必要です");
    }

    const score = scoreForLevel(lesson.level);

    const { error } = await supabase.from("academy_lesson_completions").upsert(
      {
        lesson_id: id,
        user_id: caller.userId,
        tenant_id: caller.tenantId,
        score_earned: score,
      },
      { onConflict: "lesson_id,user_id" },
    );
    if (error) return apiInternalError(error);

    return apiOk({ message: "完了マークを記録しました", score_earned: score });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { error } = await supabase
      .from("academy_lesson_completions")
      .delete()
      .eq("lesson_id", id)
      .eq("user_id", caller.userId);
    if (error) return apiInternalError(error);

    return apiOk({ message: "完了マークを取り消しました" });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
