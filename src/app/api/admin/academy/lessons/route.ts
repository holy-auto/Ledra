/**
 * GET /api/admin/academy/lessons   一覧
 * POST /api/admin/academy/lessons  新規作成
 *
 * 閲覧範囲:
 * - tab="published": 公開済み全件 (Free は level='intro' のみ)
 * - tab="drafts":    自テナントの下書き (admin+ 推奨、RLSで強制)
 * - tab="mine":      自分が作者
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiForbidden } from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";
import {
  LESSON_LEVELS,
  lessonCreateSchema,
  checkLessonCreatePermission,
  insertLesson,
} from "@/lib/academy/createLesson";

export const dynamic = "force-dynamic";

/** GET 一覧 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { searchParams } = new URL(req.url);
    const tab = (searchParams.get("tab") ?? "published") as "published" | "drafts" | "mine";
    const category = searchParams.get("category");
    const level = searchParams.get("level");

    let query = supabase
      .from("academy_lessons")
      .select(
        "id, tenant_id, author_user_id, category, level, difficulty, title, summary, video_url, cover_image_url, tags, status, published_at, view_count, rating_avg, rating_count, created_at",
      );

    if (tab === "drafts") {
      query = query.eq("tenant_id", caller.tenantId).eq("status", "draft");
    } else if (tab === "mine") {
      query = query.eq("author_user_id", caller.userId);
    } else {
      query = query.eq("status", "published");
      // Free プランは入門のみ
      if (!canUseFeature(caller.planTier, "academy_know_how")) {
        query = query.eq("level", "intro");
      }
    }

    if (category) query = query.eq("category", category);
    if (level && (LESSON_LEVELS as readonly string[]).includes(level)) query = query.eq("level", level);

    const { data, error } = await query.order("rating_avg", { ascending: false }).limit(100);
    if (error) return apiInternalError(error);

    const intro_only = tab === "published" && !canUseFeature(caller.planTier, "academy_know_how");

    return apiOk({ lessons: data ?? [], intro_only });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}

/** POST 作成 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = lessonCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const permission = checkLessonCreatePermission(caller, parsed.data);
    if (!permission.ok) return apiForbidden(permission.reason);

    const { data, error } = await insertLesson(supabase, caller, parsed.data);
    if (error) return apiInternalError(error);

    return apiOk({ id: data?.id }, 201);
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
