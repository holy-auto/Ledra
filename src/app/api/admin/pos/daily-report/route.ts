import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

// ─── GET: Z-report（日計レポート） ───
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!requireMinRole(caller, "staff")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const date =
      url.searchParams.get("date") ??
      new Date().toISOString().slice(0, 10);

    // 日付範囲
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    // 支払方法ごとの集計（GROUP BY相当 — Supabase JS SDKにはGROUP BYがないのでRPCかraw SQLを使うか、
    // 全件取得して件数が限られているのでSQL側で集計する）
    // Supabase JS SDK では GROUP BY を直接サポートしないため、
    // 対象日の支払いを一括取得し、JS側で集計する方法と、rpcを使う方法がある。
    // ここでは対象日の取引は最大200件程度なので、一括取得 + JS集計で実装する。

    const { data: payments, error } = await supabase
      .from("payments")
      .select("id, amount, payment_method, status, paid_at, customer_id, note")
      .eq("tenant_id", caller.tenantId)
      .gte("paid_at", dayStart)
      .lte("paid_at", dayEnd)
      .eq("status", "completed")
      .order("paid_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[daily-report] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    const rows = payments ?? [];

    // 支払方法ごとの集計
    const byMethod: Record<string, { count: number; total: number }> = {};
    let totalSales = 0;

    for (const p of rows) {
      const method = p.payment_method ?? "other";
      if (!byMethod[method]) {
        byMethod[method] = { count: 0, total: 0 };
      }
      byMethod[method].count += 1;
      byMethod[method].total += p.amount ?? 0;
      totalSales += p.amount ?? 0;
    }

    // 顧客名を一括取得
    const customerIds = [
      ...new Set(rows.map((p) => p.customer_id).filter(Boolean)),
    ];
    const customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", customerIds);
      (customers ?? []).forEach((c) => {
        customerMap[c.id] = c.name;
      });
    }

    const transactions = rows.map((p) => ({
      id: p.id,
      amount: p.amount,
      payment_method: p.payment_method,
      paid_at: p.paid_at,
      customer_name: p.customer_id
        ? (customerMap[p.customer_id] ?? null)
        : null,
    }));

    return NextResponse.json({
      date,
      summary: {
        total_sales: totalSales,
        total_transactions: rows.length,
        by_method: byMethod,
      },
      transactions,
    });
  } catch (e: unknown) {
    console.error("daily-report failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
