/**
 * GET /api/admin/academy/certificates
 *
 * 認証ユーザーのカテゴリ別レッスン完了数を返却し、
 * CERTIFICATE_THRESHOLD 以上のカテゴリを "eligible" としてマーク。
 */

import { apiOk, apiInternalError } from "@/lib/api/response";
import { CATEGORY_LABEL, CERTIFICATE_THRESHOLD } from "@/lib/academy/certificate";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

export const GET = withCaller(
  async (_req, { caller, supabase }) => {
    try {

      // 完了レッスンのカテゴリを取得
      const { data: completions, error } = await supabase
        .from("academy_lesson_completions")
        .select("lesson_id, completed_at")
        .eq("user_id", caller.userId);

      if (error) return apiInternalError(error);

      const lessonIds = (completions ?? []).map((c) => c.lesson_id as string);

      let categoryCounts: Record<string, { count: number; latest_at: string }> = {};

      if (lessonIds.length > 0) {
        const { data: lessons, error: lErr } = await supabase
          .from("academy_lessons")
          .select("id, category")
          .in("id", lessonIds);

        if (lErr) return apiInternalError(lErr);

        // completions と lessons を結合してカテゴリ別カウント
        const completionMap = Object.fromEntries((completions ?? []).map((c) => [c.lesson_id, c.completed_at as string]));

        for (const lesson of lessons ?? []) {
          const cat = lesson.category as string;
          const at = completionMap[lesson.id as string] ?? "";
          if (!categoryCounts[cat]) {
            categoryCounts[cat] = { count: 0, latest_at: at };
          }
          categoryCounts[cat].count++;
          if (at > categoryCounts[cat].latest_at) {
            categoryCounts[cat].latest_at = at;
          }
        }
      }

      const result = Object.entries(CATEGORY_LABEL).map(([category, label]) => ({
        category,
        label,
        completed: categoryCounts[category]?.count ?? 0,
        threshold: CERTIFICATE_THRESHOLD,
        eligible: (categoryCounts[category]?.count ?? 0) >= CERTIFICATE_THRESHOLD,
        latest_at: categoryCounts[category]?.latest_at ?? null,
      }));

      return apiOk({ categories: result });
    } catch (e: unknown) {
      return apiInternalError(e);
    }
  },
  { routeName: "admin/academy/certificates GET" },
);
