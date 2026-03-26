import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { getAdminClient } from "@/lib/api/auth";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiInternalError,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

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

    const admin = getAdminClient();
    const tenantId = caller.tenantId;

    // Calculate the cutoff timestamp
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Fetch recent certificates
    const certsPromise = (async () => {
      try {
        const { data } = await admin
          .from("certificates")
          .select("public_id, customer_name, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50);
        return data ?? [];
      } catch {
        return [];
      }
    })();

    // Fetch recent invoices (documents with doc_type = invoice)
    const invoicesPromise = (async () => {
      try {
        const { data } = await admin
          .from("documents")
          .select("id, doc_number, customer_id, created_at")
          .eq("tenant_id", tenantId)
          .eq("doc_type", "invoice")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50);

        if (!data || data.length === 0) return [];

        // Resolve customer names
        const customerIds = [
          ...new Set(data.filter((d) => d.customer_id).map((d) => d.customer_id as string)),
        ];
        const customerNames: Record<string, string> = {};
        if (customerIds.length > 0) {
          const { data: customers } = await admin
            .from("customers")
            .select("id, name")
            .in("id", customerIds);
          for (const c of customers ?? []) {
            customerNames[c.id] = c.name;
          }
        }

        return data.map((inv) => ({
          ...inv,
          customer_name: inv.customer_id ? (customerNames[inv.customer_id] ?? null) : null,
        }));
      } catch {
        return [];
      }
    })();

    // Fetch recent reservations
    const reservationsPromise = (async () => {
      try {
        const { data } = await admin
          .from("reservations")
          .select("id, scheduled_date, scheduled_time, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50);
        return data ?? [];
      } catch {
        return [];
      }
    })();

    // Fetch recent customers
    const customersPromise = (async () => {
      try {
        const { data } = await admin
          .from("customers")
          .select("id, name, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50);
        return data ?? [];
      } catch {
        return [];
      }
    })();

    const [certs, invoices, reservations, customers] = await Promise.all([
      certsPromise,
      invoicesPromise,
      reservationsPromise,
      customersPromise,
    ]);

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

    return apiOk({ activities: limited50, summary });
  } catch (e) {
    return apiInternalError(e, "admin/activity");
  }
}
