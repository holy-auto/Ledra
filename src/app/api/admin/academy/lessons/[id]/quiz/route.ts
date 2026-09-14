/**
 * GET /api/admin/academy/lessons/[id]/quiz   質問一覧
 *   - 作者/super_admin には correct_index/explanation を含む完全な情報
 *   - それ以外は採点用情報を隠した形 (回答提出後に attempt API でフィードバック)
 *
 * PUT /api/admin/academy/lessons/[id]/quiz   一括置換 (作者/super_admin)
 *   - 既存質問を削除して payload で再作成。順序は配列順 (position 自動採番)
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

export const dynamic = "force-dynamic";

const questionSchema = z.object({
  id: z.string().uuid().optional(), // 既存IDは無視 (一括置換)
  question: z.string().trim().min(1, "質問文を入力してください").max(1000),
  choices: z.array(z.string().trim().min(1).max(300)).min(2, "選択肢は2つ以上必要です").max(6, "選択肢は6つまでです"),
  correct_index: z.number().int().min(0).max(5),
  explanation: z.string().trim().max(2000).optional().nullable(),
});

const putSchema = z.object({
  questions: z.array(questionSchema).max(30, "質問は30問まで"),
});

async function isAuthor(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  lessonId: string,
  userId: string,
  isSuperAdmin: boolean,
): Promise<{ exists: boolean; isAuthor: boolean }> {
  const { data } = await supabase.from("academy_lessons").select("id, author_user_id").eq("id", lessonId).maybeSingle();
  if (!data) return { exists: false, isAuthor: false };
  return { exists: true, isAuthor: data.author_user_id === userId || isSuperAdmin };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { exists, isAuthor: canEdit } = await isAuthor(supabase, id, caller.userId, caller.role === "super_admin");
    if (!exists) return apiNotFound("レッスンが見つかりません");

    const { data, error } = await supabase
      .from("academy_quiz_questions")
      .select("id, position, question, choices, correct_index, explanation")
      .eq("lesson_id", id)
      .order("position", { ascending: true });

    if (error) return apiInternalError(error);

    const questions = (data ?? []).map((q) => {
      if (canEdit) return q;
      // 採点情報を隠す
      return {
        id: q.id,
        position: q.position,
        question: q.question,
        choices: q.choices,
      };
    });

    return apiOk({ questions, can_edit: canEdit });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { exists, isAuthor: canEdit } = await isAuthor(supabase, id, caller.userId, caller.role === "super_admin");
    if (!exists) return apiNotFound("レッスンが見つかりません");
    if (!canEdit) return apiForbidden("クイズの編集は作者のみ可能です");

    const parsed = putSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    // 各 correct_index が choices 範囲内か検証
    for (const q of parsed.data.questions) {
      if (q.correct_index >= q.choices.length) {
        return apiValidationError("正解番号が選択肢の範囲外です");
      }
    }

    // 既存削除 → 再挿入 (一括置換)
    const { error: delErr } = await supabase.from("academy_quiz_questions").delete().eq("lesson_id", id);
    if (delErr) return apiInternalError(delErr);

    if (parsed.data.questions.length === 0) {
      return apiOk({ message: "クイズを空にしました", count: 0 });
    }

    const rows = parsed.data.questions.map((q, i) => ({
      lesson_id: id,
      position: i,
      question: q.question,
      choices: q.choices,
      correct_index: q.correct_index,
      explanation: q.explanation ?? null,
    }));

    const { error: insErr } = await supabase.from("academy_quiz_questions").insert(rows);
    if (insErr) return apiInternalError(insErr);

    return apiOk({ message: "クイズを保存しました", count: rows.length });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
