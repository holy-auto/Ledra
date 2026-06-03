import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { sendLowStockAlert } from "@/lib/follow-up/email";
import { maybeAutoDraftReordersForTenant } from "@/lib/ai/automation/reorderAuto";
import { maybeAutoDraftPartnerReordersForTenant } from "@/lib/supply/partnerReorder";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Low-stock alert cron — daily.
 *
 * 各テナントの inventory_items を走査して `current_stock <= min_stock`
 * (かつ `min_stock > 0`) の品目を集約し、1 通のサマリーメールで通知する。
 *
 * 冪等性:
 *   - cron_locks で並列起動を防止 (Vercel timeout retry 対策)
 *   - notification_logs.type = 'low_stock_alert' で日付ベースの重複防止
 *
 * 通知先:
 *   - tenants.contact_email を優先 (admin/settings で編集可)
 *   - 設定が空のテナントはスキップ
 */
export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  try {
    const supabase = createServiceRoleAdmin("cron:low-stock-alerts — scans every tenant's inventory_items");
    const todayStr = new Date().toISOString().slice(0, 10);

    const lock = await withCronLock(supabase, "low-stock-alerts", 600, async () => {
      let notified = 0;
      let flagged = 0;
      let reordersDrafted = 0;

      const { data: items } = await supabase
        .from("inventory_items")
        .select("tenant_id, name, sku, current_stock, min_stock, unit")
        .eq("is_active", true)
        .gt("min_stock", 0);

      if (!items || items.length === 0) return { notified, flagged };

      type LowItem = {
        name: string;
        sku: string | null;
        current_stock: number;
        min_stock: number;
        unit: string;
      };
      const byTenant = new Map<string, LowItem[]>();
      for (const r of items) {
        if (Number(r.current_stock) > Number(r.min_stock)) continue;
        const list = byTenant.get(r.tenant_id) ?? [];
        list.push({
          name: r.name as string,
          sku: (r.sku as string | null) ?? null,
          current_stock: Number(r.current_stock),
          min_stock: Number(r.min_stock),
          unit: (r.unit as string) || "個",
        });
        byTenant.set(r.tenant_id, list);
      }

      if (byTenant.size === 0) return { notified, flagged };

      const tenantIds = Array.from(byTenant.keys());
      const { data: tenants } = await supabase.from("tenants").select("id, name, contact_email").in("id", tenantIds);
      const tenantMap = new Map((tenants ?? []).map((t) => [t.id as string, t]));

      for (const [tenantId, lowItems] of byTenant.entries()) {
        // 発注書ドラフトの自動起票 (inventory.auto_draft_reorder が opt-in のテナントのみ)。
        // メール未設定でも実行する (発注はメールに依存しない)。承認・送信は必ず人 (壁3)。
        const reorder = await maybeAutoDraftReordersForTenant(tenantId);
        reordersDrafted += reorder.created;

        // 供給パートナー商材に紐付け済みの品目も、提携先を選定して draft 起票する (#2/#3)。
        const partnerReorder = await maybeAutoDraftPartnerReordersForTenant(tenantId);
        reordersDrafted += partnerReorder.created;

        const tenant = tenantMap.get(tenantId);
        const email = (tenant?.contact_email as string | null) ?? null;
        if (!tenant || !email) continue;

        const { count: existingLogs } = await supabase
          .from("notification_logs")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("type", "low_stock_alert")
          .gte("sent_at", `${todayStr}T00:00:00Z`);
        if ((existingLogs ?? 0) > 0) continue;

        let sent = false;
        try {
          sent = await sendLowStockAlert({
            shopName: (tenant.name as string) ?? "施工店",
            recipientEmail: email,
            items: lowItems,
          });
        } catch (err) {
          console.error("[cron/low-stock-alerts] send error:", err);
        }

        await supabase.from("notification_logs").insert({
          tenant_id: tenantId,
          type: "low_stock_alert",
          target_type: "inventory",
          target_id: null,
          recipient_email: email,
          status: sent ? "sent" : "failed",
        });

        if (sent) {
          notified += 1;
          flagged += lowItems.length;
        }
      }

      return { notified, flagged, reordersDrafted };
    });

    if (!lock.acquired) {
      return apiOk({ skipped: "lock-held", date: todayStr });
    }

    return apiOk({
      tenants_notified: lock.value.notified,
      items_flagged: lock.value.flagged,
      reorders_drafted: lock.value.reordersDrafted,
      date: todayStr,
    });
  } catch (e) {
    await sendCronFailureAlert("low-stock-alerts", e);
    return apiInternalError("Low-stock cron failed");
  }
}
