/**
 * POST   /api/admin/academy/lessons/[id]/rate  評価 (upsert)
 * DELETE /api/admin/academy/lessons/[id]/rate  自分の評価を削除
 *
 * 評価は公開済みレッスンに対してのみ可能。
 * 自分のレッスンには評価不可 (自演防止)。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiUnauthorized,
  apiInternalError,
  apiValidationError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";

export const dynamic = "force-dynamic";

const rateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = rateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { data: lesson } = await supabase
      .from("academy_lessons")
      .select("id, status, level, author_user_id")
      .eq("id", id)
      .maybeSingle();

    if (!lesson) return apiNotFound("レッスンが見つかりません");
    if (lesson.status !== "published") return apiForbidden("公開済みレッスンのみ評価できます");
    if (lesson.author_user_id === caller.userId) return apiForbidden("自身のレッスンは評価できません");

    // Free は intro レッスンのみ評価可 (閲覧範囲と一致)
    if (lesson.level !== "intro" && !canUseFeature(caller.planTier, "academy_know_how")) {
      return apiForbidden("このレッスンの評価には Starter プラン以上が必要です");
    }

    const { error } = await supabase.from("academy_lesson_ratings").upsert(
      {
        lesson_id: id,
        user_id: caller.userId,
        tenant_id: caller.tenantId,
        rating: parsed.data.rating,
        comment: parsed.data.comment || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id,user_id" },
    );
    if (error) return apiInternalError(error);

    return apiOk({ message: "評価を送信しました" });
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
      .from("academy_lesson_ratings")
      .delete()
      .eq("lesson_id", id)
      .eq("user_id", caller.userId);
    if (error) return apiInternalError(error);

    return apiOk({ message: "評価を削除しました" });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
