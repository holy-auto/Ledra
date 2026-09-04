/**
 * GET    /api/admin/academy/lessons/[id]  詳細取得 (view_count を増分)
 * PATCH  /api/admin/academy/lessons/[id]  更新 (作者 or super_admin)
 * DELETE /api/admin/academy/lessons/[id]  削除 (作者 or super_admin)
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
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { resolveLessonPlayback, type LessonVideoFields } from "@/lib/video/resolveLessonPlayback";
import { canModifyLesson } from "@/lib/academy/createLesson";

export const dynamic = "force-dynamic";

const VALID_LEVELS = ["intro", "basic", "standard", "pro"] as const;

const updateSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  summary: z.string().trim().max(500).nullable().optional(),
  body: z.string().trim().min(10).max(50000).optional(),
  category: z.string().trim().min(1).max(50).optional(),
  level: z.enum(VALID_LEVELS).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  video_url: z.string().trim().url().max(1000).nullable().optional().or(z.literal("")),
  cover_image_url: z.string().trim().url().max(1000).nullable().optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data, error } = await supabase
      .from("academy_lessons")
      .select(
        "id, tenant_id, author_user_id, category, level, difficulty, title, summary, body, video_url, video_provider, video_asset_id, video_playback_id, video_status, video_duration_sec, video_provider_metadata, cover_image_url, tags, status, published_at, view_count, rating_avg, rating_count, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return apiInternalError(error);
    if (!data) return apiNotFound("レッスンが見つかりません");

    // 公開済みかつ Free で intro 以外は閲覧不可
    const isPublished = data.status === "published";
    const isAuthor = data.author_user_id === caller.userId;
    const isOwnTenant = data.tenant_id === caller.tenantId;

    if (isPublished && !isAuthor && !isOwnTenant) {
      const introOnly = !canUseFeature(caller.planTier, "academy_know_how");
      if (introOnly && data.level !== "intro") {
        return apiForbidden("このレッスンの閲覧には Starter プラン以上が必要です");
      }
    }

    // view_count をインクリメント (公開レッスンを他者が閲覧したときのみ)
    if (isPublished && !isAuthor) {
      const admin = createPlatformScopedAdmin("academy lessons: increment view_count cross-tenant");
      await admin
        .from("academy_lessons")
        .update({ view_count: (data.view_count ?? 0) + 1 })
        .eq("id", id);
    }

    // 自身の評価を取得
    const { data: myRating } = await supabase
      .from("academy_lesson_ratings")
      .select("rating, comment")
      .eq("lesson_id", id)
      .eq("user_id", caller.userId)
      .maybeSingle();

    // 完了済みかどうか
    const { data: myCompletion } = await supabase
      .from("academy_lesson_completions")
      .select("completed_at, score_earned")
      .eq("lesson_id", id)
      .eq("user_id", caller.userId)
      .maybeSingle();

    // クイズの問題数
    const { count: quizQuestionCount } = await supabase
      .from("academy_quiz_questions")
      .select("id", { count: "exact", head: true })
      .eq("lesson_id", id);

    // 自分の直近・最高得点クイズ結果
    const { data: bestAttempt } = await supabase
      .from("academy_quiz_attempts")
      .select("score, total, passed, attempted_at")
      .eq("lesson_id", id)
      .eq("user_id", caller.userId)
      .order("score", { ascending: false })
      .order("attempted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const video = resolveLessonPlayback(data as LessonVideoFields);

    return apiOk({
      lesson: data,
      video,
      my_rating: myRating ?? null,
      my_completion: myCompletion ?? null,
      quiz_question_count: quizQuestionCount ?? 0,
      my_quiz_best: bestAttempt ?? null,
    });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const v = parsed.data;

    // 既存取得 (権限確認とステータス遷移用)
    const { data: existing } = await supabase
      .from("academy_lessons")
      .select("id, status, author_user_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return apiNotFound("レッスンが見つかりません");

    if (!canModifyLesson(caller, existing)) {
      return apiForbidden("このレッスンを編集する権限がありません");
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of ["title", "summary", "body", "category", "level", "difficulty", "tags", "status"] as const) {
      if (v[k] !== undefined) update[k] = v[k];
    }
    if (v.video_url !== undefined) update.video_url = v.video_url || null;
    if (v.cover_image_url !== undefined) update.cover_image_url = v.cover_image_url || null;

    // 公開トグル: draft -> published で published_at を埋める
    if (v.status === "published" && existing.status !== "published") {
      update.published_at = new Date().toISOString();
    }

    const { error } = await supabase.from("academy_lessons").update(update).eq("id", id);
    if (error) return apiInternalError(error);

    return apiOk({ message: "更新しました" });
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

    const { data: existing } = await supabase
      .from("academy_lessons")
      .select("id, author_user_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return apiNotFound("レッスンが見つかりません");

    if (!canModifyLesson(caller, existing)) {
      return apiForbidden("このレッスンを削除する権限がありません");
    }

    const { error } = await supabase.from("academy_lessons").delete().eq("id", id);
    if (error) return apiInternalError(error);

    return apiOk({ message: "削除しました" });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
