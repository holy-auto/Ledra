/**
 * GET  /api/admin/academy/rewards   自分の報酬履歴 (super_admin は全件 + author_email)
 * POST /api/admin/academy/rewards   月次集計実行 (super_admin のみ)
 *   body: { period_month: "2026-05-01" }
 */

import { z } from "zod";

import { apiOk, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { calculateMonthlyRewards } from "@/lib/academy/rewards";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

const calculateSchema = z.object({
  period_month: z.string().regex(/^\d{4}-\d{2}-01$/, "period_month は YYYY-MM-01 形式で指定してください"),
});

export const GET = withCaller(
  async (req, { caller, supabase }) => {
    try {

      const isSuperAdmin = caller.role === "super_admin";

      let query = supabase
        .from("academy_creator_rewards")
        .select(
          "id, tenant_id, author_user_id, period_month, qualifying_lessons, lesson_count, reward_per_lesson, total_amount_jpy, status, stripe_credit_id, applied_at, notes, created_at",
        )
        .order("period_month", { ascending: false })
        .order("created_at", { ascending: false });

      if (!isSuperAdmin) {
        query = query.eq("author_user_id", caller.userId);
      }

      // super_admin は ?tenant_id= でフィルタ可
      const { searchParams } = new URL(req.url);
      const filterTenant = searchParams.get("tenant_id");
      if (isSuperAdmin && filterTenant) {
        query = query.eq("tenant_id", filterTenant);
      }

      const filterStatus = searchParams.get("status");
      if (filterStatus) {
        query = query.eq("status", filterStatus);
      }

      const { data, error } = await query.limit(200);
      if (error) return apiInternalError(error);

      return apiOk({ rewards: data ?? [], is_admin: isSuperAdmin });
    } catch (e: unknown) {
      return apiInternalError(e);
    }
  },
  { routeName: "admin/academy/rewards GET" },
);

export const POST = withCaller(
  async (req, { caller }) => {
    try {
      if (caller.role !== "super_admin") return apiForbidden("super_admin のみ実行できます");

      const body = await req.json().catch(() => ({}));
      const parsed = calculateSchema.safeParse(body);
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }

      const result = await calculateMonthlyRewards(parsed.data.period_month);
      if (!result.ok) {
        return apiInternalError(new Error(result.reason));
      }

      return apiOk({
        period_month: parsed.data.period_month,
        inserted: result.inserted,
        skipped_existing: result.skipped_existing,
      });
    } catch (e: unknown) {
      return apiInternalError(e);
    }
  },
  { routeName: "admin/academy/rewards POST" },
);
