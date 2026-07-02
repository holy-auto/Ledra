import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { withCache } from "@/lib/cache";

/**
 * GET /api/admin/sidebar-badges
 *
 * Returns badge counts for sidebar nav items:
 * - reservations_today: count of today's reservations
 * - square_unlinked: count of square orders without customer_id
 * - expiring_certs_7d: certificates expiring within 7 days
 * - draft_certs: certificates in draft status
 * - overdue_invoices: invoices past due date and not paid
 * - pending_orders: orders with status pending or in_progress
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // サイドバーは全 admin ページで読まれるため、テナント単位で 20 秒キャッシュして
    // 毎ナビゲーションの 7 本のカウントを間引く (バッジは情報表示で軽微な stale 許容)。
    // 恒常的な列欠落 (schema drift) を吸収する try/catch→0 は維持しつつ、それ以外の
    // 一過性エラーは throw して劣化スナップショットをキャッシュしない。
    const badges = await withCache(`sidebar-badges:${caller.tenantId}`, 20, async () => {
      // Today's date in JST (UTC+9)
      const now = new Date();
      const jstOffset = 9 * 60 * 60 * 1000;
      const jstDate = new Date(now.getTime() + jstOffset);
      const today = jstDate.toISOString().slice(0, 10);

      // 7 days from now in JST
      const sevenDaysLater = new Date(jstDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      const sevenDaysLaterStr = sevenDaysLater.toISOString().slice(0, 10);

      // Count today's reservations (exclude cancelled)。一過性エラーは throw (非キャッシュ)。
      const reservationsPromise = (async () => {
        const { count, error } = await admin
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", caller.tenantId)
          .eq("scheduled_date", today)
          .neq("status", "cancelled");
        if (error) throw error;
        return count ?? 0;
      })();

      // Count unlinked square orders (no customer_id)。
      const squareUnlinkedPromise = (async () => {
        const { count, error } = await admin
          .from("square_orders")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", caller.tenantId)
          .is("customer_id", null);
        if (error) throw error;
        return count ?? 0;
      })();

      // Count certificates expiring within 7 days
      const expiringCertsPromise = (async () => {
        try {
          const { count } = await admin
            .from("certificates")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", caller.tenantId)
            .gte("expiry_date", today)
            .lte("expiry_date", sevenDaysLaterStr)
            .neq("status", "voided");
          return count ?? 0;
        } catch {
          return 0;
        }
      })();

      // Count draft certificates
      const draftCertsPromise = (async () => {
        try {
          const { count } = await admin
            .from("certificates")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", caller.tenantId)
            .eq("status", "draft");
          return count ?? 0;
        } catch {
          return 0;
        }
      })();

      // Count overdue invoices (past due_date, not paid)
      const overdueInvoicesPromise = (async () => {
        try {
          const { count } = await admin
            .from("documents")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", caller.tenantId)
            .eq("doc_type", "invoice")
            .lt("due_date", today)
            .neq("status", "paid");
          return count ?? 0;
        } catch {
          return 0;
        }
      })();

      // Count pending orders (pending or in_progress)
      const pendingOrdersPromise = (async () => {
        try {
          const { count } = await admin
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", caller.tenantId)
            .in("status", ["pending", "in_progress"]);
          return count ?? 0;
        } catch {
          return 0;
        }
      })();

      // Count unread inbound customer messages (LINE inbox)
      const unreadMessagesPromise = (async () => {
        try {
          const { count } = await admin
            .from("customer_messages")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", caller.tenantId)
            .eq("direction", "inbound")
            .is("read_at", null);
          return count ?? 0;
        } catch {
          // read_at 列が無い環境ではバッジを出さない
          return 0;
        }
      })();

      const [reservations, square, expiringCerts, draftCerts, overdueInvoices, pendingOrders, unreadMessages] =
        await Promise.all([
          reservationsPromise,
          squareUnlinkedPromise,
          expiringCertsPromise,
          draftCertsPromise,
          overdueInvoicesPromise,
          pendingOrdersPromise,
          unreadMessagesPromise,
        ]);

      return {
        reservations_today: reservations,
        square_unlinked: square,
        expiring_certs_7d: expiringCerts,
        draft_certs: draftCerts,
        overdue_invoices: overdueInvoices,
        pending_orders: pendingOrders,
        messages_unread: unreadMessages,
      };
    });

    return apiJson(
      { ok: true, ...badges },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } },
    );
  } catch (e) {
    return apiInternalError(e, "sidebar-badges");
  }
}
