/**
 * GET /api/admin/platform/store-usage?month=YYYY-MM
 *
 * 運営ダッシュボード「店舗利用状況」のデータソース。プラットフォーム管理者 (運営) 専用。
 *
 * 返すもの:
 *   - stores:          店舗別 月間 操作回数 / 予約 / 請求 / アクティブ会員 / 最終ログイン
 *   - cumulative:      予約・作業記録・請求 の累計件数 (全期間・全店舗、exact count)
 *   - feature_adoption: 機能別利用率 (当月にその機能を使った店舗の割合)
 *
 * ポイント:
 *   - createPlatformScopedAdmin で RLS をバイパスするため、全 query は tenant を跨いで読む。
 *   - 月内の行は tenant_id のみを取得して JS で集計 (buildStoreUsage は純関数)。
 *   - 累計は head:true の exact count で件数だけ取得 (行はフェッチしない)。
 *
 * ponytail: 月内行の取得は 1 テーブルあたり最大 ROW_LIMIT 件までの全スキャン。件数がこれを
 * 超えると truncated=true を立てて UI に警告表示する (集計値は過小)。アップグレード経路:
 * per-tenant 集計を行う SQL RPC (staff_performance_stats と同様) に置き換える。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import {
  buildStoreUsage,
  monthRangeJst,
  currentMonthJst,
  type IdRow,
  type TenantMeta,
} from "@/lib/analytics/storeUsage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 月内 tenant_id フェッチの上限。超過時は truncated フラグを立てる。 */
const ROW_LIMIT = 20000;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const url = new URL(req.url);
    const monthParam = url.searchParams.get("month") ?? "";
    const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonthJst();
    const range = monthRangeJst(month);
    if (!range) return apiJson({ ok: false, error: "invalid month" }, { status: 400 });
    const { monthStart, monthEnd } = range;

    const admin = createPlatformScopedAdmin("platform store-usage — 店舗別利用状況の横断集計");

    // 月内行 (tenant_id のみ) を取得するヘルパー。
    const inMonth = (table: string, dateCol: string) =>
      admin.from(table).select("tenant_id").gte(dateCol, monthStart).lt(dateCol, monthEnd).limit(ROW_LIMIT);

    const [
      tenantsRes,
      membershipsRes,
      opsRes,
      reservationsRes,
      invoicesRes,
      certificatesRes,
      customersRes,
      paymentsRes,
      cumReservationsRes,
      cumWorkRecordsRes,
      cumInvoicesRes,
    ] = await Promise.all([
      admin.from("tenants").select("id, name, plan_tier, is_active"),
      admin.from("tenant_memberships").select("tenant_id, user_id"),
      inMonth("vehicle_histories", "performed_at"),
      inMonth("reservations", "created_at"),
      admin
        .from("documents")
        .select("tenant_id")
        .in("doc_type", ["invoice", "consolidated_invoice"])
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd)
        .limit(ROW_LIMIT),
      inMonth("certificates", "created_at"),
      inMonth("customers", "created_at"),
      inMonth("payments", "created_at"),
      admin.from("reservations").select("id", { count: "exact", head: true }),
      admin.from("vehicle_histories").select("id", { count: "exact", head: true }),
      admin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .in("doc_type", ["invoice", "consolidated_invoice"]),
    ]);

    const tenants = (tenantsRes.data ?? []) as TenantMeta[];
    const memberships = (membershipsRes.data ?? []) as { tenant_id: string; user_id: string }[];

    // last_sign_in_at を auth.users から取得 (ページング)。
    const lastSignInByUser = new Map<string, string | null>();
    let page = 1;
    // 最大 5 ページ (perPage 1000) = 5000 会員まで。それ以上は近似 (login 指標のみ影響)。
    for (; page <= 5; page++) {
      const { data: usersData, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      const users = usersData?.users ?? [];
      for (const u of users as Array<{ id: string; last_sign_in_at?: string | null }>) {
        lastSignInByUser.set(u.id, u.last_sign_in_at ?? null);
      }
      if (users.length < 1000) break;
    }

    const asIdRows = (r: { data: unknown }): IdRow[] => (r.data as IdRow[] | null) ?? [];
    const operationsRows = asIdRows(opsRes);
    const reservationRows = asIdRows(reservationsRes);
    const invoiceRows = asIdRows(invoicesRes);
    const certificateRows = asIdRows(certificatesRes);
    const customerRows = asIdRows(customersRes);
    const paymentRows = asIdRows(paymentsRes);

    const truncated = [operationsRows, reservationRows, invoiceRows, certificateRows, customerRows, paymentRows].some(
      (rows) => rows.length >= ROW_LIMIT,
    );

    const result = buildStoreUsage({
      month,
      monthStart,
      monthEnd,
      tenants,
      memberships,
      lastSignInByUser,
      operationsRows,
      reservationRows,
      invoiceRows,
      certificateRows,
      customerRows,
      paymentRows,
      cumulative: {
        reservations: cumReservationsRes.count ?? 0,
        work_records: cumWorkRecordsRes.count ?? 0,
        invoices: cumInvoicesRes.count ?? 0,
      },
    });

    return apiJson({ ok: true, ...result, truncated });
  } catch (e) {
    return apiInternalError(e, "platform/store-usage");
  }
}
