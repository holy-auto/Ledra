import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

export const GET = withCaller(
  async (_req, { caller, supabase }) => {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes?.user) {
        return apiUnauthorized();
      }

      // --- Platform admin bypass: always report pro / active ---
      if (caller && isPlatformAdmin(caller)) {
        return apiJson(
          {
            tenant_id: caller.tenantId,
            tenant_name: "Ledra Platform",
            plan_tier: "pro",
            is_active: true,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      const { data: mem } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();

      const tenantId = mem?.tenant_id as string | undefined;
      if (!tenantId) {
        return apiValidationError("テナントが見つかりません。");
      }

      const { data: t, error } = await supabase
        .from("tenants")
        .select("id,name,plan_tier,is_active")
        .eq("id", tenantId)
        .single();

      if (error || !t) {
        return apiNotFound("テナントが見つかりません。");
      }

      return apiJson(
        {
          tenant_id: t.id,
          tenant_name: t.name ?? null,
          plan_tier: String(t.plan_tier ?? ""),
          is_active: !!t.is_active,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (e) {
      return apiInternalError(e, "admin/billing-status");
    }
  },
  { rateLimit: "general", routeName: "admin/billing-status" },
);
