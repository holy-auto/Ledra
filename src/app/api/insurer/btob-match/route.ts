import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { matchBtobTenants, type TenantCandidate } from "@/lib/ai/btobMatchEngine";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  categories: z.array(z.string().trim().min(1)).max(10).default([]),
  prefecture: z.string().trim().max(10).nullable().optional(),
  limit: z.number().int().min(1).max(20).default(10),
});

/**
 * POST /api/insurer/btob-match
 *
 * 保険会社が要求する条件 (カテゴリ・エリア) にマッチする施工店を
 * SQL + スコアリング + LLM 推薦文で返す。
 *
 * Body: { categories: string[], prefecture?: string, limit?: number }
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "ai");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

  const { categories, prefecture, limit } = parsed.data;
  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // 1. 保険会社にアクセス権のあるテナント一覧を取得
    const { data: accessRows } = await admin
      .from("insurer_tenant_access")
      .select("tenant_id, tenants(id, name, prefecture, category)")
      .eq("insurer_id", caller.insurerId)
      .eq("is_active", true)
      .limit(200);

    if (!accessRows || accessRows.length === 0) {
      return apiJson({ matches: [], total_candidates: 0 });
    }

    // 2. 直近 90 日の案件数を insurer_cases からカウント (テナントID で GROUP BY 代わりに map)
    const tenantIds = accessRows.map((r: any) => r.tenant_id).filter(Boolean);
    const { data: recentCases } = await admin
      .from("insurer_cases")
      .select("tenant_id")
      .eq("insurer_id", caller.insurerId)
      .gte("created_at", ninetyDaysAgo)
      .in("tenant_id", tenantIds);

    const caseCounts = new Map<string, number>();
    for (const row of recentCases ?? []) {
      if (row.tenant_id) caseCounts.set(row.tenant_id, (caseCounts.get(row.tenant_id) ?? 0) + 1);
    }

    // 3. 有効な契約テナント
    const { data: contracts } = await admin
      .from("insurer_tenant_contracts")
      .select("tenant_id")
      .eq("insurer_id", caller.insurerId)
      .eq("status", "active");

    const activeContracts = new Set((contracts ?? []).map((c: any) => c.tenant_id));

    // 4. 候補リストを構築
    const candidates: TenantCandidate[] = [];
    for (const row of accessRows as any[]) {
      const tenant = row.tenants;
      if (!tenant) continue;
      candidates.push({
        tenantId: tenant.id,
        name: tenant.name ?? "(不明)",
        // tenants.category は単数の text。以前は service_categories という
        // 存在しない列を配列として読んでいた
        serviceCategories: tenant.category ? [tenant.category] : [],
        prefecture: tenant.prefecture ?? null,
        recentCaseCount: caseCounts.get(tenant.id) ?? 0,
        hasActiveContract: activeContracts.has(tenant.id),
        avgRating: null, // future: 評価テーブルから取得
      });
    }

    // 5. マッチング + LLM 推薦文
    const matches = await matchBtobTenants(candidates, { categories, prefecture: prefecture ?? null }, 3);

    return apiJson({
      matches: matches.slice(0, limit).map((m) => ({
        tenant_id: m.tenantId,
        name: m.name,
        score: m.score,
        breakdown: m.breakdown,
        recommendation: m.recommendationText,
      })),
      total_candidates: candidates.length,
    });
  } catch (err) {
    return apiInternalError(err, "POST /api/insurer/btob-match");
  }
}
