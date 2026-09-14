import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/pagination";
import { parseJsonBody } from "@/lib/api/parseBody";
import { adminAgentCreateSchema } from "@/lib/validations/agent-content";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("agents — platform-wide agent operations (no tenant scope)");
    const status = request.nextUrl.searchParams.get("status");
    const p = parsePagination(request, { defaultPerPage: 50, maxPerPage: 200 });

    let query = admin
      .from("agents")
      .select(
        "id, name, contact_name, contact_email, contact_phone, address, status, commission_type, default_commission_rate, default_commission_fixed, stripe_account_id, stripe_onboarding_done, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    // page=0 means caller did not opt in to pagination — return all rows for
    // backward compatibility, but cap at maxPerPage to avoid runaway scans.
    if (p.page > 0) {
      query = query.range(p.from, p.to);
    } else {
      query = query.limit(p.perPage);
    }

    const { data: agents, error, count } = await query;
    if (error) {
      return apiInternalError(error, "agents GET");
    }

    // Enrich with referral/commission stats (batch queries to avoid N+1)
    const agentIds = (agents ?? []).map((a) => a.id);

    const refCountMap: Record<string, number> = {};
    const contractedCountMap: Record<string, number> = {};
    const commMap: Record<string, number> = {};

    if (agentIds.length > 0) {
      const [refsResult, commsResult] = await Promise.all([
        admin.from("agent_referrals").select("agent_id, status").in("agent_id", agentIds),
        admin
          .from("agent_commissions")
          .select("agent_id, amount")
          .in("agent_id", agentIds)
          .in("status", ["approved", "paid"]),
      ]);

      for (const ref of refsResult.data ?? []) {
        refCountMap[ref.agent_id] = (refCountMap[ref.agent_id] ?? 0) + 1;
        if (ref.status === "contracted") {
          contractedCountMap[ref.agent_id] = (contractedCountMap[ref.agent_id] ?? 0) + 1;
        }
      }

      for (const c of commsResult.data ?? []) {
        commMap[c.agent_id] = (commMap[c.agent_id] ?? 0) + (c.amount ?? 0);
      }
    }

    const enriched = (agents ?? []).map((agent) => ({
      ...agent,
      referral_count: refCountMap[agent.id] ?? 0,
      contracted_count: contractedCountMap[agent.id] ?? 0,
      total_commission: commMap[agent.id] ?? 0,
    }));

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return apiJson(
      {
        agents: enriched,
        page: p.page,
        per_page: p.perPage,
        total: count ?? null,
      },
      { headers },
    );
  } catch (e) {
    return apiInternalError(e, "agents GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = await parseJsonBody(request, adminAgentCreateSchema);
    if (!parsed.ok) return parsed.response;
    const { name, contact_name, contact_email, contact_phone, address } = parsed.data;

    const admin = createPlatformScopedAdmin("agents — platform-wide agent operations (no tenant scope)");
    const { data, error } = await admin
      .from("agents")
      .insert({
        name,
        contact_name: contact_name ?? null,
        contact_email: contact_email ?? null,
        contact_phone: contact_phone ?? null,
        address: address ?? null,
      })
      .select(
        "id, name, contact_name, contact_email, contact_phone, address, status, commission_type, default_commission_rate, default_commission_fixed, created_at, updated_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "agents POST");
    }

    return apiJson({ agent: data }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agents POST");
  }
}
