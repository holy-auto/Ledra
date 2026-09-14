/**
 * POST /api/admin/academy/lessons/[id]/quiz/attempt
 *
 * クライアントから { answers: [{question_id, selected_index}] } を受け取り、
 * サーバー側で採点。70% 以上で合格 → academy_lesson_completions を upsert
 * (= スコア&進捗が自動反映される)。
 *
 * - 自分のレッスンは挑戦不可
 * - Free は intro レッスンのみ
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
import { scoreForLevel } from "@/lib/academy/scoring";

export const dynamic = "force-dynamic";

const PASS_THRESHOLD = 0.7;

const attemptSchema = z.object({
  answers: z
    .array(
      z.object({
        question_id: z.string().uuid(),
        selected_index: z.number().int().min(0).max(5),
      }),
    )
    .min(1, "回答が空です")
    .max(30),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = attemptSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { data: lesson } = await supabase
      .from("academy_lessons")
      .select("id, status, level, author_user_id")
      .eq("id", id)
      .maybeSingle();
    if (!lesson) return apiNotFound("レッスンが見つかりません");
    if (lesson.status !== "published") return apiForbidden("公開済みレッスンのみ挑戦できます");
    if (lesson.author_user_id === caller.userId) return apiForbidden("自身のレッスンは挑戦できません");

    if (lesson.level !== "intro" && !canUseFeature(caller.planTier, "academy_know_how")) {
      return apiForbidden("このクイズへの挑戦には Starter プラン以上が必要です");
    }

    const { data: questions, error: qErr } = await supabase
      .from("academy_quiz_questions")
      .select("id, correct_index, explanation")
      .eq("lesson_id", id);
    if (qErr) return apiInternalError(qErr);
    if (!questions || questions.length === 0) {
      return apiValidationError("このレッスンにはクイズがありません");
    }

    const correctMap = new Map<string, { correct_index: number; explanation: string | null }>();
    for (const q of questions) {
      correctMap.set(q.id, {
        correct_index: q.correct_index,
        explanation: q.explanation ?? null,
      });
    }

    // 採点: 全問題に対して回答を照合 (回答漏れは不正解扱い)
    const total = questions.length;
    const answerMap = new Map<string, number>();
    for (const a of parsed.data.answers) answerMap.set(a.question_id, a.selected_index);

    let correct = 0;
    const results = questions.map((q) => {
      const selected = answerMap.get(q.id);
      const isCorrect = selected !== undefined && selected === q.correct_index;
      if (isCorrect) correct++;
      return {
        question_id: q.id,
        selected_index: selected ?? null,
        correct_index: q.correct_index,
        is_correct: isCorrect,
        explanation: q.explanation,
      };
    });

    const passed = total > 0 && correct / total >= PASS_THRESHOLD;

    // attempt 記録
    const { error: attemptErr } = await supabase.from("academy_quiz_attempts").insert({
      lesson_id: id,
      user_id: caller.userId,
      tenant_id: caller.tenantId,
      score: correct,
      total,
      passed,
      answers: results.map((r) => ({
        question_id: r.question_id,
        selected_index: r.selected_index,
        is_correct: r.is_correct,
      })),
    });
    if (attemptErr) return apiInternalError(attemptErr);

    // 合格時はレッスン完了を upsert (重複時はスコア再加算なし)
    let auto_completed = false;
    if (passed) {
      const score = scoreForLevel(lesson.level);
      const { error: complErr } = await supabase.from("academy_lesson_completions").upsert(
        {
          lesson_id: id,
          user_id: caller.userId,
          tenant_id: caller.tenantId,
          score_earned: score,
        },
        { onConflict: "lesson_id,user_id" },
      );
      if (!complErr) auto_completed = true;
    }

    return apiOk({
      score: correct,
      total,
      passed,
      pass_threshold: PASS_THRESHOLD,
      auto_completed,
      results,
    });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
