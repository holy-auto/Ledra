import { resolveOrgUserContext } from "@/lib/auth/orgAccess";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

export const GET = withCaller(
  async (_req, { caller, supabase }) => {
    try {
      // テナント未所属でも「本社専用ユーザ」(組織オーナー / 本社チーム) なら通す。
      // role=null + is_org_user=true を返し、client は本社向け画面のみ表示する。
      if (!caller) {
        const org = await resolveOrgUserContext(supabase);
        if (!org) return apiUnauthorized();
        const { data: userRes } = await supabase.auth.getUser();
        return apiJson({
          user_id: org.userId,
          email: userRes?.user?.email ?? null,
          tenant_id: null,
          tenant_name: null,
          plan_tier: "free",
          role: null,
          is_platform_admin: false,
          is_org_user: true,
          is_org_owner: org.isOrgOwner,
        });
      }

      // Fetch tenant info
      const { data: tenant } = await supabase
        .from("tenants")
        .select("id, name, plan_tier")
        .eq("id", caller.tenantId)
        .single();

      return apiJson({
        user_id: caller.userId,
        email: (await supabase.auth.getUser()).data?.user?.email ?? null,
        tenant_id: caller.tenantId,
        tenant_name: tenant?.name ?? null,
        plan_tier: tenant?.plan_tier ?? "free",
        role: caller.role ?? "admin",
        is_platform_admin: isPlatformAdmin(caller),
        is_org_user: false,
        is_org_owner: false,
      });
    } catch (e: unknown) {
      return apiInternalError(e, "me");
    }
  },
  { routeName: "admin/me GET" },
);
