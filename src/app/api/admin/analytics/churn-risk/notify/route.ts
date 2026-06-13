/**
 * POST /api/admin/analytics/churn-risk/notify
 *
 * 離反リスク顧客に LINE 再来店メッセージを送る。
 * Body: { customer_ids: string[] }  (1 回最大 20 件)。
 * LINE 連携済み (line_user_id あり) の顧客のみ送信。結果を
 * notification_logs (type='churn_reengagement') に記録する。
 *
 * AuthZ: 管理者 (admin) 以上。テナント境界は createTenantScopedAdmin +
 * 明示的 tenant_id 絞り込みで担保。
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/parseBody";
import { sendMaintenanceLineMessage } from "@/lib/line/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PER_CALL = 20;
const NOTIF_TYPE = "churn_reengagement";

const notifySchema = z.object({
  customer_ids: z
    .array(z.string().uuid())
    .min(1, "対象顧客を選択してください。")
    .max(MAX_PER_CALL, `一度に送信できるのは最大${MAX_PER_CALL}件です。`),
});

type CustomerRow = { id: string; name: string | null; line_user_id: string | null };

function buildMessage(shopName: string, customerName: string): string {
  return [
    `${customerName} 様`,
    ``,
    `${shopName}です。いつもご利用ありがとうございます。`,
    `その後、お車の調子はいかがでしょうか。`,
    `点検やメンテナンスのご相談など、お気軽にご連絡ください。またのご来店を心よりお待ちしております。`,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasMinRole(caller.role, "admin")) {
      return apiForbidden("この機能には管理者権限が必要です。");
    }

    const parsed = await parseJsonBody(req, notifySchema);
    if (!parsed.ok) return parsed.response;
    const ids = [...new Set(parsed.data.customer_ids)];

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    const [{ data: tenant }, { data: rawCustomers }] = await Promise.all([
      admin.from("tenants").select("name").eq("id", tenantId).maybeSingle<{ name: string | null }>(),
      admin
        .from("customers")
        .select("id, name, line_user_id")
        .eq("tenant_id", tenantId)
        .in("id", ids)
        .returns<CustomerRow[]>(),
    ]);

    const shopName = tenant?.name?.trim() || "当店";
    const customers = rawCustomers ?? [];

    let sent = 0;
    const skipped: string[] = []; // LINE 未連携
    const failed: string[] = [];
    const logRows: Array<Record<string, unknown>> = [];

    for (const c of customers) {
      if (!c.line_user_id) {
        skipped.push(c.id);
        continue;
      }
      const ok = await sendMaintenanceLineMessage({
        tenantId,
        lineUserId: c.line_user_id,
        lineMessage: buildMessage(shopName, c.name ?? "お客様"),
      });
      if (ok) sent++;
      else failed.push(c.id);
      logRows.push({
        tenant_id: tenantId,
        type: NOTIF_TYPE,
        target_type: "customer",
        target_id: c.id,
        recipient_line_user_id: c.line_user_id,
        status: ok ? "sent" : "failed",
      });
    }

    if (logRows.length > 0) {
      await admin.from("notification_logs").insert(logRows);
    }

    return apiJson({
      ok: true,
      requested: ids.length,
      sent,
      skipped_no_line: skipped.length,
      failed: failed.length,
    });
  } catch (e) {
    return apiInternalError(e, "admin/analytics/churn-risk/notify POST");
  }
}
