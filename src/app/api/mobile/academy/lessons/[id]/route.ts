import { NextRequest } from "next/server";

import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import {
  apiOk,
  apiUnauthorized,
  apiInternalError,
  apiValidationError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";
import { lessonStatusUpdateSchema, canModifyLesson, buildLessonStatusUpdate } from "@/lib/academy/createLesson";

export const dynamic = "force-dynamic";

/**
 * PATCH  /api/mobile/academy/lessons/[id] — 公開状態の変更（取り消し・再公開）
 * DELETE /api/mobile/academy/lessons/[id] — 削除
 *
 * 誤って公開した投稿を現場で取り下げられるようにするための口。
 * モバイルからは本文の編集はさせず、公開状態の変更と削除に絞る
 * （本文編集は入力量が多く、管理画面の方が適している）。
 *
 * 権限は管理画面と同じ canModifyLesson（作者本人 or 運営）。
 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const parsed = lessonStatusUpdateSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { data: existing } = await caller.supabase
      .from("academy_lessons")
      .select("id, status, author_user_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return apiNotFound("ナレッジが見つかりません");

    if (!canModifyLesson(caller, existing)) {
      return apiForbidden("この投稿を変更する権限がありません");
    }

    const { error } = await caller.supabase
      .from("academy_lessons")
      .update(buildLessonStatusUpdate(parsed.data.status, existing.status))
      .eq("id", id);
    if (error) return apiInternalError(error);

    return apiOk({ message: "更新しました" });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const { data: existing } = await caller.supabase
      .from("academy_lessons")
      .select("id, author_user_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return apiNotFound("ナレッジが見つかりません");

    if (!canModifyLesson(caller, existing)) {
      return apiForbidden("この投稿を削除する権限がありません");
    }

    const { error } = await caller.supabase.from("academy_lessons").delete().eq("id", id);
    if (error) return apiInternalError(error);

    return apiOk({ message: "削除しました" });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
