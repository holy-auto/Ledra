import { NextRequest } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { runMonthlyInvoices } from "@/lib/orders/monthlyInvoice";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/monthly-invoices
 * 末締め翌末払いの合算請求書を生成・送付する月末 cron。
 * vercel.json で "0 1 28-31 * *" に設定（毎月28〜31日の深夜1時に起動）。
 * 月末日かどうかをハンドラ内で確認し、月末以外は即 skip する。
 */
export async function GET(req: NextRequest) {
  const { authorized } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized();

  // 月末日チェック（28〜31日に起動するが、月末日のみ処理）
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isLastDayOfMonth = today.getMonth() !== tomorrow.getMonth();

  if (!isLastDayOfMonth) {
    return apiJson({ ok: true, skipped: "not-last-day-of-month", date: today.toISOString().slice(0, 10) });
  }

  const supabase = createServiceRoleAdmin("monthly-invoices cron");

  return withCronLock(supabase, "monthly-invoices", 3600, async () => {
    const result = await runMonthlyInvoices(today);
    return apiJson({ ok: true, ...result, date: today.toISOString().slice(0, 10) });
  }).then((lockResult) => {
    if (!lockResult.acquired) {
      return apiJson({ ok: true, skipped: "lock-held" });
    }
    return lockResult.value as ReturnType<typeof apiJson>;
  }).catch((e) => apiInternalError(e, "monthly-invoices cron"));
}
