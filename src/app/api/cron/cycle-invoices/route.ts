import { NextRequest } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { runCycleInvoices } from "@/lib/orders/cycleInvoice";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/cycle-invoices
 * 顧客ごとの締め日に、指名(invoice)オーダーの合算請求書を下書き生成する日次 cron。
 * vercel.json で毎日 1 回起動し、runCycleInvoices が「本日が締め日の顧客」だけ処理する。
 */
export async function GET(req: NextRequest) {
  const { authorized } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized();

  const today = new Date();
  const supabase = createServiceRoleAdmin("cycle-invoices cron");

  return withCronLock(supabase, "cycle-invoices", 3600, async () => {
    const result = await runCycleInvoices(today);
    return apiJson({ ok: true, ...result, date: today.toISOString().slice(0, 10) });
  })
    .then((lockResult) => {
      if (!lockResult.acquired) {
        return apiJson({ ok: true, skipped: "lock-held" });
      }
      return lockResult.value as ReturnType<typeof apiJson>;
    })
    .catch((e) => apiInternalError(e, "cycle-invoices cron"));
}
