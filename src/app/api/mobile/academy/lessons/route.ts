import { NextRequest } from "next/server";

import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiForbidden } from "@/lib/api/response";
import { lessonCreateSchema, checkLessonCreatePermission, insertLesson } from "@/lib/academy/createLesson";

export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/academy/lessons — モバイルからのナレッジ投稿。
 *
 * 権限・組み立ては管理画面と同じ src/lib/academy/createLesson.ts を使う。
 * status="published" にすると他テナントからも読めるようになる（RLS の
 * academy_lessons_select_published）ため、公開の可否は投稿者が明示的に選ぶ。
 *
 * 直接 Supabase に insert させないのは、RLS だけだと staff でも書けてしまい
 * 「投稿は admin 以上」という管理画面のルールが崩れるため。
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const parsed = lessonCreateSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const permission = checkLessonCreatePermission(caller, parsed.data);
    if (!permission.ok) return apiForbidden(permission.reason);

    const { data, error } = await insertLesson(caller.supabase, caller, parsed.data);
    if (error) return apiInternalError(error);

    return apiOk({ id: data?.id }, 201);
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
