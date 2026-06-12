import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** documents.total を売上に算入しないステータス */
const EXCLUDED_DOC_STATUSES = new Set(["draft", "cancelled"]);

type RankRule = {
  id: string;
  rank_order: number;
  min_visits: number;
  min_total_spend: number;
};

/**
 * 来店回数・累計売上から最適なランクを選ぶ。
 * 閾値 (min_visits / min_total_spend) を満たすルールのうち
 * rank_order が最小 (= 最高ランク) のものを返す。該当なしは null。
 */
function pickRank(rules: RankRule[], visitCount: number, totalSpend: number): string | null {
  let best: RankRule | null = null;
  for (const r of rules) {
    if (visitCount >= r.min_visits && totalSpend >= r.min_total_spend) {
      if (!best || r.rank_order < best.rank_order) best = r;
    }
  }
  return best?.id ?? null;
}

// ─── POST: 顧客ランク再計算 ───
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const tenantId = caller.tenantId;

    // 1) ランク定義 / 顧客 / 売上 (documents) / 来店 (reservations) を並列取得
    const [rankRes, customerRes, docRes, resvRes] = await Promise.all([
      supabase
        .from("customer_rank_rules")
        .select("id, rank_order, min_visits, min_total_spend")
        .eq("tenant_id", tenantId),
      supabase.from("customers").select("id, rank_id, total_spend, visit_count").eq("tenant_id", tenantId),
      supabase.from("documents").select("customer_id, total, status").eq("tenant_id", tenantId),
      supabase.from("reservations").select("customer_id, status").eq("tenant_id", tenantId).eq("status", "completed"),
    ]);

    if (rankRes.error) return apiInternalError(rankRes.error, "customer-ranks recalculate (ranks)");
    if (customerRes.error) return apiInternalError(customerRes.error, "customer-ranks recalculate (customers)");
    if (docRes.error) return apiInternalError(docRes.error, "customer-ranks recalculate (documents)");
    if (resvRes.error) return apiInternalError(resvRes.error, "customer-ranks recalculate (reservations)");

    const rules: RankRule[] = (rankRes.data ?? []).map((r) => ({
      id: r.id as string,
      rank_order: Number(r.rank_order ?? 0),
      min_visits: Number(r.min_visits ?? 0),
      min_total_spend: Number(r.min_total_spend ?? 0),
    }));

    // 2) 顧客ごとに 累計売上 / 来店回数 を集計
    const spendByCustomer = new Map<string, number>();
    for (const d of docRes.data ?? []) {
      const cid = d.customer_id as string | null;
      if (!cid) continue;
      if (EXCLUDED_DOC_STATUSES.has(String(d.status))) continue;
      spendByCustomer.set(cid, (spendByCustomer.get(cid) ?? 0) + Number(d.total ?? 0));
    }

    const visitsByCustomer = new Map<string, number>();
    for (const r of resvRes.data ?? []) {
      const cid = r.customer_id as string | null;
      if (!cid) continue;
      visitsByCustomer.set(cid, (visitsByCustomer.get(cid) ?? 0) + 1);
    }

    // 3) 各顧客の rank_id / total_spend / visit_count を再計算し、差分のみ UPDATE
    const { admin } = createTenantScopedAdmin(tenantId);
    let updated = 0;

    for (const c of customerRes.data ?? []) {
      const cid = c.id as string;
      const totalSpend = spendByCustomer.get(cid) ?? 0;
      const visitCount = visitsByCustomer.get(cid) ?? 0;
      const rankId = pickRank(rules, visitCount, totalSpend);

      const prevSpend = Number(c.total_spend ?? 0);
      const prevVisits = Number(c.visit_count ?? 0);
      const prevRank = (c.rank_id as string | null) ?? null;

      // 値が変わっていなければスキップ (書込みを最小化)
      if (prevSpend === totalSpend && prevVisits === visitCount && prevRank === rankId) {
        continue;
      }

      const { error } = await admin
        .from("customers")
        .update({
          rank_id: rankId,
          total_spend: totalSpend,
          visit_count: visitCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cid)
        .eq("tenant_id", tenantId);
      if (error) return apiInternalError(error, "customer-ranks recalculate (update)");
      updated++;
    }

    return apiJson({ ok: true, updated });
  } catch (e) {
    return apiInternalError(e, "customer-ranks recalculate");
  }
}
