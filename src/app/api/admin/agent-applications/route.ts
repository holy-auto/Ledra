import { createPlatformScopedAdmin } from "@/lib/supabase/admin";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/pagination";

import { withCaller } from "@/lib/api/withCaller";
/**
 * GET /api/admin/agent-applications
 * List agent applications with optional status filter.
 */
export const GET = withCaller(
  async (request, { caller }) => {
    try {
      if (!isPlatformAdmin(caller)) return apiForbidden();

      const admin = createPlatformScopedAdmin("agent-applications — platform-wide agent operations (no tenant scope)");
      const status = request.nextUrl.searchParams.get("status");
      const p = parsePagination(request, { defaultPerPage: 50, maxPerPage: 200 });

      let query = admin
        .from("agent_applications")
        .select(
          "id, application_number, company_name, contact_name, email, phone, industry, status, created_at, updated_at, rejection_reason",
          { count: "exact" },
        )
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      if (p.page > 0) query = query.range(p.from, p.to);
      else query = query.limit(p.perPage);

      const { data, error, count } = await query;
      if (error) {
        return apiInternalError(error, "agent-applications GET");
      }

      return apiJson({
        applications: data ?? [],
        page: p.page,
        per_page: p.perPage,
        total: count ?? null,
      });
    } catch (e) {
      return apiInternalError(e, "agent-applications GET");
    }
  },
  { routeName: "agent-applications GET" },
);
