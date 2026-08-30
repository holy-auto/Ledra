import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError, apiNotFound } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { adminAgentUpdateSchema } from "@/lib/validations/agent-content";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("agents")
      .select(
        "id, name, contact_name, contact_email, contact_phone, address, status, commission_type, default_commission_rate, default_commission_fixed, stripe_account_id, stripe_onboarding_done, line_official_id, notes, created_at, updated_at",
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return apiNotFound("agent not found");
    }

    // Get referrals, commissions, and members in parallel
    const [{ data: referrals }, { data: commissions }, { data: members }] = await Promise.all([
      admin
        .from("agent_referrals")
        .select(
          "id, agent_id, shop_name, contact_name, contact_email, contact_phone, status, notes, created_at, updated_at",
        )
        .eq("agent_id", id)
        .order("created_at", { ascending: false }),
      admin
        .from("agent_commissions")
        .select(
          "id, agent_id, referral_id, base_amount, amount, commission_rate, commission_type, status, period_start, period_end, paid_at, created_at, updated_at",
        )
        .eq("agent_id", id)
        .order("period_start", { ascending: false }),
      admin
        .from("agent_users")
        .select("id, agent_id, user_id, role, display_name, created_at, updated_at")
        .eq("agent_id", id)
        .order("created_at", { ascending: true }),
    ]);

    return apiJson({
      agent: data,
      referrals: referrals ?? [],
      commissions: commissions ?? [],
      members: members ?? [],
    });
  } catch (e) {
    return apiInternalError(e, "agents [id] GET");
  }
}

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = await parseJsonBody(request, adminAgentUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const updates = parsed.data;
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data, error } = await admin
      .from("agents")
      .update(updates)
      .eq("id", id)
      .select(
        "id, name, contact_name, contact_email, contact_phone, address, status, commission_type, default_commission_rate, default_commission_fixed, stripe_account_id, stripe_onboarding_done, line_official_id, notes, created_at, updated_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "agents [id] PUT");
    }

    return apiJson({ agent: data });
  } catch (e) {
    return apiInternalError(e, "agents [id] PUT");
  }
}
