import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/tenants/search?q=xxx
 * テナント名でインクリメンタルサーチ（発注先選択用）
 * 自テナントは除外
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return apiUnauthorized();

    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 1) {
      return apiValidationError("検索キーワードを入力してください");
    }

    // 自テナント一覧を取得（除外用）
    const { data: myMemberships } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", userRes.user.id);
    const myTenantIds = (myMemberships ?? []).map((m) => m.tenant_id);

    // name で ILIKE 検索
    let query = supabase
      .from("tenants")
      .select("id, name, slug")
      .ilike("name", `%${q}%`)
      .eq("is_active", true)
      .limit(20);

    // 自テナントを除外
    for (const tid of myTenantIds) {
      query = query.neq("id", tid);
    }

    const { data: tenants, error } = await query;

    if (error) return apiInternalError(error, "search tenants");

    // partner_scores があれば付与
    const tenantIds = (tenants ?? []).map((t) => t.id);
    let scoresMap: Record<string, { completed_orders: number; avg_rating: number | null }> = {};
    if (tenantIds.length > 0) {
      const { data: scores } = await supabase
        .from("partner_scores")
        .select("tenant_id, completed_orders, avg_rating")
        .in("tenant_id", tenantIds);
      for (const s of scores ?? []) {
        scoresMap[s.tenant_id] = {
          completed_orders: s.completed_orders,
          avg_rating: s.avg_rating,
        };
      }
    }

    const results = (tenants ?? []).map((t) => ({
      tenant_id: t.id,
      company_name: t.name,
      slug: t.slug,
      completed_orders: scoresMap[t.id]?.completed_orders ?? 0,
      avg_rating: scoresMap[t.id]?.avg_rating ?? null,
    }));

    return NextResponse.json({ tenants: results });
  } catch (e) {
    return apiInternalError(e, "search tenants");
  }
}
