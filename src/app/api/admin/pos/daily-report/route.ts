import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { todayJst } from "@/lib/gantt/board";

export const dynamic = "force-dynamic";

// ─── GET: Z-report（日計レポート） ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const url = new URL(req.url);
    // 既定日は JST の今日（UTC の today だと JST 深夜に前日を指す）。
    const date = url.searchParams.get("date") ?? todayJst();

    // 日付範囲は JST 基準（+09:00）で確定する。paid_at は timestamptz なので
    // オフセット付き ISO で比較すれば TZ に依らず正しい 1 日になる。
    const dayStart = `${date}T00:00:00+09:00`;
    const dayEnd = `${date}T23:59:59.999+09:00`;

    // 日計の総額/件数は SQL 側で集計する（以前は最大 200 件しか取得せず JS 集計だったため、
    // 繁忙日に total_sales が過小計上されていた）。支払方法ごとに SUM/COUNT を RPC で返す。
    const { data: totals, error } = await supabase.rpc("pos_daily_sales_totals", {
      p_tenant_id: caller.tenantId,
      p_day_start: dayStart,
      p_day_end: dayEnd,
    });
    if (error) {
      return apiInternalError(error, "daily-report");
    }

    const byMethod: Record<string, { count: number; total: number }> = {};
    let totalSales = 0;
    let totalTransactions = 0;
    for (const r of (totals ?? []) as Array<{ payment_method: string | null; cnt: number; total: number }>) {
      const method = r.payment_method ?? "other";
      const count = Number(r.cnt ?? 0);
      const total = Number(r.total ?? 0);
      byMethod[method] = { count, total };
      totalSales += total;
      totalTransactions += count;
    }

    // 取引明細は表示用に上限付きで別途取得する（総額は上の集計でカバー済み）。
    const { data: payments } = await supabase
      .from("payments")
      .select("id, amount, payment_method, paid_at, customer_id")
      .eq("tenant_id", caller.tenantId)
      .gte("paid_at", dayStart)
      .lte("paid_at", dayEnd)
      .eq("status", "completed")
      .order("paid_at", { ascending: false })
      .limit(200);
    const rows = payments ?? [];

    // 顧客名を一括取得
    const customerIds = [...new Set(rows.map((p) => p.customer_id).filter(Boolean))];
    const customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase.from("customers").select("id, name").in("id", customerIds);
      (customers ?? []).forEach((c) => {
        customerMap[c.id] = c.name;
      });
    }

    const transactions = rows.map((p) => ({
      id: p.id,
      amount: p.amount,
      payment_method: p.payment_method,
      paid_at: p.paid_at,
      customer_name: p.customer_id ? (customerMap[p.customer_id] ?? null) : null,
    }));

    return apiJson({
      date,
      summary: {
        total_sales: totalSales,
        total_transactions: totalTransactions,
        by_method: byMethod,
      },
      transactions,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "daily-report");
  }
}
