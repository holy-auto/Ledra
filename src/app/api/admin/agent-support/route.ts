import { createPlatformScopedAdmin } from "@/lib/supabase/admin";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiForbidden, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

export const GET = withCaller(
  async (request, { caller }) => {
    try {
      if (!isPlatformAdmin(caller)) return apiForbidden();

      const admin = createPlatformScopedAdmin("agent-support — platform-wide agent operations (no tenant scope)");
      const status = request.nextUrl.searchParams.get("status");

      let query = admin
        .from("agent_support_tickets")
        .select("*, agents:agent_id(id, name)")
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data: tickets, error } = await query;
      if (error) {
        return apiInternalError(error, "agent-support GET");
      }

      return apiJson({ tickets: tickets ?? [] });
    } catch (e) {
      return apiInternalError(e, "agent-support GET");
    }
  },
  { routeName: "agent-support GET" },
);
