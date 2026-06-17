import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { resolveUserId } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 組織横断ダッシュボード API。
 *
 * 組織オーナーが所属全店舗 (member tenants) の当月実績を横断集計する。
 * オーナーは各店舗のテナントメンバーとは限らないため、組織所有を server
 * (RLS) で検証したうえで、各店舗データの集計は createPlatformScopedAdmin
 * (RLS bypass) で行う (正当なクロステナント参照)。
 *
 * 返却する店舗別指標:
 *   - reservations_this_month : 当月の予約件数 (reservations.scheduled_date)
 *   - revenue_this_month      : 当月発行の帳票合計 (documents.total, issued_at)
 *   - active_jobs             : status が completed/cancelled 以外の予約件数
 */

/** 当月の [開始日(含む), 翌月開始日(含まない)] を YYYY-MM-DD で返す (date 列比較用)。 */
function monthRange(now = new Date()): { start: string; nextStart: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    start: fmt(new Date(Date.UTC(y, m, 1))),
    nextStart: fmt(new Date(Date.UTC(y, m + 1, 1))),
  };
}

const CLOSED_STATUSES = ["completed", "cancelled"] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await resolveUserId(supabase);
    if (!userId) return apiUnauthorized();

    const { id: orgId } = await params;

    // 組織所有を検証 (RLS: owner_id = auth.uid() の行のみ可視)。
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", orgId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!org) return apiNotFound("対象の組織が見つかりません。");

    const admin = createPlatformScopedAdmin("組織オーナーによる横断ダッシュボード集計 (クロステナント)");

    // 所属店舗 (tenant) を取得。
    const { data: members, error: mErr } = await admin
      .from("organization_members")
      .select("tenant_id, tenant:tenants ( id, name )")
      .eq("organization_id", orgId)
      .order("joined_at", { ascending: true });
    if (mErr) return apiInternalError(mErr, "org dashboard members");

    const { start, nextStart } = monthRange();

    const perTenant = await Promise.all(
      (members ?? []).map(async (m) => {
        const tenantId = m.tenant_id as string;
        const tenant = (m as { tenant?: { name?: string } | null }).tenant ?? null;

        // 当月予約件数 (head: true で行は取得せず count のみ)。
        const reservationsPromise = admin
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("scheduled_date", start)
          .lt("scheduled_date", nextStart);

        // 進行中案件 (completed/cancelled 以外)。
        const activePromise = admin
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .not("status", "in", `(${CLOSED_STATUSES.join(",")})`);

        // 当月発行帳票の合計売上 (total を集計)。
        const revenuePromise = admin
          .from("documents")
          .select("total")
          .eq("tenant_id", tenantId)
          .gte("issued_at", start)
          .lt("issued_at", nextStart);

        const [reservationsRes, activeRes, revenueRes] = await Promise.all([
          reservationsPromise,
          activePromise,
          revenuePromise,
        ]);

        if (reservationsRes.error) throw reservationsRes.error;
        if (activeRes.error) throw activeRes.error;
        if (revenueRes.error) throw revenueRes.error;

        const revenue = (revenueRes.data ?? []).reduce((sum, row) => {
          const v = (row as { total?: number | null }).total;
          return sum + (typeof v === "number" ? v : 0);
        }, 0);

        return {
          tenant_id: tenantId,
          tenant_name: tenant?.name ?? null,
          reservations_this_month: reservationsRes.count ?? 0,
          revenue_this_month: revenue,
          active_jobs: activeRes.count ?? 0,
        };
      }),
    );

    const totals = perTenant.reduce(
      (acc, t) => ({
        reservations: acc.reservations + t.reservations_this_month,
        revenue: acc.revenue + t.revenue_this_month,
        active_jobs: acc.active_jobs + t.active_jobs,
      }),
      { reservations: 0, revenue: 0, active_jobs: 0 },
    );

    return apiJson({ tenants: perTenant, totals });
  } catch (e) {
    return apiInternalError(e, "org dashboard GET");
  }
}
