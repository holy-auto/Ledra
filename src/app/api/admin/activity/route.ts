import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { withCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

type ActivityItem = {
  type: string;
  title: string;
  detail: string;
  at: string;
};

/**
 * GET /api/admin/activity?days=1
 *
 * Returns recent activity items for the tenant (certificates, invoices,
 * reservations, customers created within the time range).
 */
export async function GET(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const url = new URL(req.url);
    const days = Math.min(7, Math.max(1, parseInt(url.searchParams.get("days") ?? "1", 10)));

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const tenantId = caller.tenantId;

    // 直近アクティビティは 4 テーブルを横断取得して JS で整形する。数十秒の遅延は
    // 許容できるため、テナント×期間で Redis に 60 秒キャッシュする (認証は毎回検証済み)。
    const payload = await withCache(`activity:${tenantId}:${days}`, 60, async () => {
      // Calculate the cutoff timestamp
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Fetch recent certificates。エラーは throw して withCache に劣化結果を
      // キャッシュさせない (握りつぶすと 0 件スナップショットが TTL 中配信されるため)。
      const certsPromise = (async () => {
        const { data, error } = await admin
          .from("certificates")
          .select("public_id, customer_name, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return data ?? [];
      })();

      // Fetch recent invoices (documents with doc_type = invoice)
      const invoicesPromise = (async () => {
        const { data, error } = await admin
          .from("documents")
          .select("id, doc_number, customer_id, created_at")
          .eq("tenant_id", tenantId)
          .eq("doc_type", "invoice")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;

        if (!data || data.length === 0) return [];

        // Resolve customer names
        const customerIds = [...new Set(data.filter((d) => d.customer_id).map((d) => d.customer_id as string))];
        const customerNames: Record<string, string> = {};
        if (customerIds.length > 0) {
          const { data: customers, error: custErr } = await admin
            .from("customers")
            .select("id, name")
            .in("id", customerIds);
          if (custErr) throw custErr;
          for (const c of customers ?? []) {
            customerNames[c.id] = c.name;
          }
        }

        return data.map((inv) => ({
          ...inv,
          customer_name: inv.customer_id ? (customerNames[inv.customer_id] ?? null) : null,
        }));
      })();

      // Fetch recent reservations
      const reservationsPromise = (async () => {
        const { data, error } = await admin
          .from("reservations")
          .select("id, scheduled_date, scheduled_time, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return data ?? [];
      })();

      // Fetch recent customers
      const customersPromise = (async () => {
        const { data, error } = await admin
          .from("customers")
          .select("id, name, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return data ?? [];
      })();

      // allSettled で全件を待ってから、いずれか失敗なら throw する。all だと最初の
      // reject 後に兄弟 Promise の reject が unhandled になりうるため避ける。
      const [certsR, invoicesR, reservationsR, customersR] = await Promise.allSettled([
        certsPromise,
        invoicesPromise,
        reservationsPromise,
        customersPromise,
      ]);
      for (const r of [certsR, invoicesR, reservationsR, customersR]) {
        if (r.status === "rejected") throw r.reason;
      }
      const certs = certsR.status === "fulfilled" ? certsR.value : [];
      const invoices = invoicesR.status === "fulfilled" ? invoicesR.value : [];
      const reservations = reservationsR.status === "fulfilled" ? reservationsR.value : [];
      const customers = customersR.status === "fulfilled" ? customersR.value : [];

      // Build activity items
      const activities: ActivityItem[] = [];

      for (const c of certs) {
        const detail = [c.public_id, c.customer_name].filter(Boolean).join(" / ");
        activities.push({
          type: "certificate_created",
          title: "証明書を発行",
          detail,
          at: c.created_at,
        });
      }

      for (const inv of invoices) {
        const name = inv.customer_name ?? "";
        const detail = [`#${inv.doc_number}`, name].filter(Boolean).join(" / ");
        activities.push({
          type: "invoice_created",
          title: "請求書を作成",
          detail,
          at: inv.created_at,
        });
      }

      for (const r of reservations) {
        const datePart = r.scheduled_date ?? "";
        const timePart = r.scheduled_time ? ` ${r.scheduled_time}` : "";
        activities.push({
          type: "reservation_created",
          title: "予約を登録",
          detail: `${datePart}${timePart}`,
          at: r.created_at,
        });
      }

      for (const cu of customers) {
        activities.push({
          type: "customer_created",
          title: "顧客を登録",
          detail: cu.name ?? "",
          at: cu.created_at,
        });
      }

      // Sort by at desc, limit 50
      activities.sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0));
      const limited50 = activities.slice(0, 50);

      const summary = {
        certs: certs.length,
        invoices: invoices.length,
        reservations: reservations.length,
        customers: customers.length,
      };

      return { activities: limited50, summary };
    });

    return apiOk(payload);
  } catch (e) {
    return apiInternalError(e, "admin/activity");
  }
}
