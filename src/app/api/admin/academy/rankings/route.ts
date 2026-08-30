/**
 * GET /api/admin/academy/rankings
 *
 * ?type=lessons  カテゴリ別レッスンランキング (rating_avg × rating_count)
 *   &category=ppf   (省略=全体)
 *   &limit=5
 *
 * ?type=mvp      月間 MVP 投稿者 (最多 qualifying レッスン数)
 *   &period_month=2026-05-01  (省略=直近集計月)
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "lessons";
    const limitParam = Math.min(parseInt(searchParams.get("limit") ?? "5", 10) || 5, 20);

    if (type === "lessons") {
      const category = searchParams.get("category");

      // Free プランは intro のみ表示
      const introOnly = !canUseFeature(caller.planTier, "academy_know_how");

      let query = supabase
        .from("academy_lessons")
        .select("id, title, category, level, rating_avg, rating_count, tenant_id, cover_image_url")
        .eq("status", "published")
        .gt("rating_count", 0);

      if (introOnly) query = query.eq("level", "intro");
      if (category) query = query.eq("category", category);

      // rating_avg * rating_count をスコアとして降順に並べる
      // Supabase では computed column で order できないため、十分な件数を取得してアプリ側でソート
      const { data, error } = await query.order("rating_avg", { ascending: false }).limit(limitParam * 5); // 多めに取ってアプリ側でスコアソート

      if (error) return apiInternalError(error);

      const sorted = (data ?? [])
        .map((l) => ({
          ...l,
          score: Number(l.rating_avg) * (l.rating_count as number),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limitParam);

      return apiOk({ lessons: sorted, intro_only: introOnly });
    }

    if (type === "mvp") {
      const periodMonth = searchParams.get("period_month");

      let query = supabase
        .from("academy_creator_rewards")
        .select("author_user_id, tenant_id, lesson_count, total_amount_jpy, period_month, qualifying_lessons");

      if (periodMonth) {
        query = query.eq("period_month", periodMonth);
      } else {
        // 最新の集計月を取得
        const { data: latest } = await supabase
          .from("academy_creator_rewards")
          .select("period_month")
          .order("period_month", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latest?.period_month) {
          query = query.eq("period_month", latest.period_month as string);
        }
      }

      const { data: rewards, error: rewardsError } = await query
        .order("lesson_count", { ascending: false })
        .order("total_amount_jpy", { ascending: false })
        .limit(limitParam);

      if (rewardsError) return apiInternalError(rewardsError);

      if (!rewards || rewards.length === 0) {
        return apiOk({ mvp: null, runners_up: [] });
      }

      // テナント名を一括取得
      const tenantIds = [
        ...new Set((rewards as Array<{ tenant_id: string | null }>).map((r) => r.tenant_id).filter(Boolean)),
      ] as string[];

      let tenantMap: Record<string, string> = {};
      if (tenantIds.length > 0) {
        const { data: tenants } = await supabase.from("tenants").select("id, name").in("id", tenantIds);
        tenantMap = Object.fromEntries((tenants ?? []).map((t) => [t.id, t.name as string]));
      }

      const enriched = (
        rewards as Array<{
          author_user_id: string;
          tenant_id: string | null;
          lesson_count: number;
          total_amount_jpy: number;
          period_month: string;
          qualifying_lessons: Array<{ id: string; title: string; rating_avg: number; rating_count: number }>;
        }>
      ).map((r) => ({
        author_user_id: r.author_user_id,
        tenant_id: r.tenant_id,
        tenant_name: r.tenant_id ? (tenantMap[r.tenant_id] ?? "加盟店") : "運営",
        lesson_count: r.lesson_count,
        total_amount_jpy: r.total_amount_jpy,
        period_month: r.period_month,
        top_lesson:
          (r.qualifying_lessons as Array<{ id: string; title: string; rating_avg: number; rating_count: number }>)[0] ??
          null,
      }));

      return apiOk({
        mvp: enriched[0] ?? null,
        runners_up: enriched.slice(1),
        period_month: rewards[0]?.period_month ?? null,
      });
    }

    return apiValidationError("type は 'lessons' または 'mvp' を指定してください");
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
