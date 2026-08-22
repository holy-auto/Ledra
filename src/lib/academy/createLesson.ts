import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { hasMinRole } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";

/**
 * academy_lessons の投稿ロジック。
 *
 * 管理画面（/api/admin/academy/lessons）とモバイル（/api/mobile/academy/lessons）
 * の両方が使う。投稿は他テナントにも公開されうるので、権限判定と
 * published_at の付与を 2 箇所に書かない。
 */

export const LESSON_LEVELS = ["intro", "basic", "standard", "pro"] as const;

export const lessonCreateSchema = z.object({
  title: z.string().trim().min(3, "タイトルを3文字以上で入力してください").max(200),
  summary: z.string().trim().max(500).optional(),
  body: z.string().trim().min(10, "本文を10文字以上で入力してください").max(50000),
  category: z.string().trim().min(1).max(50),
  level: z.enum(LESSON_LEVELS).default("basic"),
  difficulty: z.number().int().min(1).max(5).default(3),
  video_url: z.string().trim().url().max(1000).optional().or(z.literal("")),
  cover_image_url: z.string().trim().url().max(1000).optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  status: z.enum(["draft", "published"]).default("draft"),
  /** super_admin のみ tenant_id=null（運営コンテンツ）で投稿可 */
  publish_as_platform: z.boolean().default(false),
});

export type LessonCreateInput = z.infer<typeof lessonCreateSchema>;

export type LessonCreateCaller = {
  userId: string;
  tenantId: string;
  role: Role;
};

export type LessonCreateDenial = { ok: false; reason: string };

/** 投稿してよいか。ダメなら理由を返す（呼び出し側が 403 にする） */
export function checkLessonCreatePermission(
  caller: LessonCreateCaller,
  input: LessonCreateInput,
): LessonCreateDenial | { ok: true } {
  // 投稿は admin 以上 (staff/viewer は不可)
  if (!hasMinRole(caller.role, "admin")) {
    return { ok: false, reason: "レッスン投稿は管理者権限が必要です" };
  }
  if (input.publish_as_platform && caller.role !== "super_admin") {
    return {
      ok: false,
      reason: "運営コンテンツとしての投稿はプラットフォーム管理者のみ可能です",
    };
  }
  return { ok: true };
}

/** academy_lessons に insert する行を組み立てる */
export function buildLessonInsert(caller: LessonCreateCaller, input: LessonCreateInput) {
  const isPlatformPost = input.publish_as_platform === true;
  return {
    tenant_id: isPlatformPost ? null : caller.tenantId,
    author_user_id: caller.userId,
    title: input.title,
    summary: input.summary || null,
    body: input.body,
    category: input.category,
    level: input.level,
    difficulty: input.difficulty,
    video_url: input.video_url || null,
    cover_image_url: input.cover_image_url || null,
    tags: input.tags,
    status: input.status,
    published_at: input.status === "published" ? new Date().toISOString() : null,
  };
}

/** 投稿を実行する。権限判定は呼び出し前に checkLessonCreatePermission で行うこと */
export async function insertLesson(supabase: SupabaseClient, caller: LessonCreateCaller, input: LessonCreateInput) {
  return supabase.from("academy_lessons").insert(buildLessonInsert(caller, input)).select("id").single();
}
