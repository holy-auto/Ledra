import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/search?q=QUERY&limit=5
 *
 * Global search across certificates, customers, vehicles, and invoices.
 * Returns grouped results filtered by tenant.
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
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get("limit") ?? "5", 10)));

    if (q.length < 2) {
      return apiValidationError("検索クエリは2文字以上入力してください。");
    }

    const escaped = escapeIlike(q);
    const escapedPgrest = escapePostgrestValue(escaped);
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const tenantId = caller.tenantId;

    // Search certificates by public_id or customer_name
    const certsPromise = (async () => {
      try {
        const { data } = await admin
          .from("certificates")
          .select("public_id, customer_name, status")
          .eq("tenant_id", tenantId)
          .or(`public_id.ilike.%${escapedPgrest}%,customer_name.ilike.%${escapedPgrest}%`)
          .order("created_at", { ascending: false })
          .limit(limit);
        return data ?? [];
      } catch {
        return [];
      }
    })();

    // Search customers by name, name_kana, email, phone
    const customersPromise = (async () => {
      try {
        const { data } = await admin
          .from("customers")
          .select("id, name, email")
          .eq("tenant_id", tenantId)
          .or(
            `name.ilike.%${escapedPgrest}%,name_kana.ilike.%${escapedPgrest}%,email.ilike.%${escapedPgrest}%,phone.ilike.%${escapedPgrest}%`,
          )
          .order("created_at", { ascending: false })
          .limit(limit);
        return data ?? [];
      } catch {
        return [];
      }
    })();

    // Search vehicles by maker, model, plate_display
    const vehiclesPromise = (async () => {
      try {
        const { data } = await admin
          .from("vehicles")
          .select("id, maker, model, plate_display")
          .eq("tenant_id", tenantId)
          .or(`maker.ilike.%${escapedPgrest}%,model.ilike.%${escapedPgrest}%,plate_display.ilike.%${escapedPgrest}%`)
          .order("created_at", { ascending: false })
          .limit(limit);
        return (data ?? []).map((v) => ({
          id: v.id,
          maker: v.maker,
          model: v.model,
          plate_number: v.plate_display,
        }));
      } catch {
        return [];
      }
    })();

    // Search invoices by doc_number (invoice_number)
    const invoicesPromise = (async () => {
      try {
        const { data } = await admin
          .from("documents")
          .select("id, doc_number, customer_id, status")
          .eq("tenant_id", tenantId)
          .eq("doc_type", "invoice")
          .ilike("doc_number", `%${escaped}%`)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (!data || data.length === 0) return [];

        // Resolve customer names for invoices
        const customerIds = [...new Set(data.filter((d) => d.customer_id).map((d) => d.customer_id as string))];
        const customerNames: Record<string, string> = {};
        if (customerIds.length > 0) {
          const { data: customers } = await admin.from("customers").select("id, name").in("id", customerIds);
          for (const c of customers ?? []) {
            customerNames[c.id] = c.name;
          }
        }

        return data.map((inv) => ({
          id: inv.id,
          invoice_number: inv.doc_number,
          customer_name: inv.customer_id ? (customerNames[inv.customer_id] ?? null) : null,
          status: inv.status,
        }));
      } catch {
        return [];
      }
    })();

    const [certificates, customers, vehicles, invoices] = await Promise.all([
      certsPromise,
      customersPromise,
      vehiclesPromise,
      invoicesPromise,
    ]);

    return apiOk({ certificates, customers, vehicles, invoices });
  } catch (e) {
    return apiInternalError(e, "admin/search");
  }
}
