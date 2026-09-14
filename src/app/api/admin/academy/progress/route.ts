/**
 * GET /api/admin/academy/progress
 *
 * 自身の Academy 学習進捗を返却:
 * - progress: academy_progress 集計 (level/total_score/lessons_completed/badges)
 * - completed_lesson_ids: 完了済みレッスンID配列 (一覧で✓を出すため)
 * - recent_completions: 直近の完了10件
 */
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { computeBadges, levelFromScore } from "@/lib/academy/scoring";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // 進捗 (なくても 0 ベースで返す)
    const { data: progressRow } = await supabase
      .from("academy_progress")
      .select(
        "level, total_score, lessons_completed, certs_reviewed, cases_submitted, standard_level, last_activity_at",
      )
      .eq("user_id", caller.userId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    const stats = {
      lessons_completed: progressRow?.lessons_completed ?? 0,
      total_score: progressRow?.total_score ?? 0,
      cases_submitted: progressRow?.cases_submitted ?? 0,
      certs_reviewed: progressRow?.certs_reviewed ?? 0,
    };

    // 完了済みレッスンID
    const { data: completions } = await supabase
      .from("academy_lesson_completions")
      .select("lesson_id, score_earned, completed_at")
      .eq("user_id", caller.userId)
      .order("completed_at", { ascending: false })
      .limit(100);

    const completedLessonIds = (completions ?? []).map((c) => c.lesson_id);

    // 直近完了の表示用にレッスンタイトル/レベルを取得
    const recentIds = (completions ?? []).slice(0, 10).map((c) => c.lesson_id);
    let lessonMap: Record<string, { title: string; level: string }> = {};
    if (recentIds.length > 0) {
      const { data: lessons } = await supabase.from("academy_lessons").select("id, title, level").in("id", recentIds);
      lessonMap = Object.fromEntries(
        (lessons ?? []).map((l) => [l.id, { title: l.title as string, level: l.level as string }]),
      );
    }

    const recent = (completions ?? []).slice(0, 10).map((c) => ({
      lesson_id: c.lesson_id,
      lesson_title: lessonMap[c.lesson_id]?.title ?? "(削除されたレッスン)",
      lesson_level: lessonMap[c.lesson_id]?.level ?? null,
      score_earned: c.score_earned,
      completed_at: c.completed_at,
    }));

    return apiOk({
      progress: {
        level: levelFromScore(stats.total_score),
        total_score: stats.total_score,
        lessons_completed: stats.lessons_completed,
        cases_submitted: stats.cases_submitted,
        certs_reviewed: stats.certs_reviewed,
        standard_level: progressRow?.standard_level ?? "none",
        last_activity_at: progressRow?.last_activity_at ?? null,
      },
      badges: computeBadges(stats),
      completed_lesson_ids: completedLessonIds,
      recent_completions: recent,
    });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
