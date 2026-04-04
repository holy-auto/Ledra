import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const admin = getAdminClient();
    const status = request.nextUrl.searchParams.get("status");

    let query = admin
      .from("agents")
      .select(
        "id, name, contact_name, contact_email, contact_phone, address, status, commission_type, default_commission_rate, default_commission_fixed, stripe_account_id, stripe_onboarding_done, created_at",
      )
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: agents, error } = await query;
    if (error) {
      return apiInternalError(error, "agents GET");
    }

    // Enrich with referral/commission stats (batch queries to avoid N+1)
    const agentIds = (agents ?? []).map((a) => a.id);

    let refCountMap: Record<string, number> = {};
    let contractedCountMap: Record<string, number> = {};
    let commMap: Record<string, number> = {};

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
    return NextResponse.json({ agents: enriched }, { headers });
  } catch (e) {
    return apiInternalError(e, "agents GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = await request.json();
    const { name, contact_name, contact_email, contact_phone, address } = body;

    if (!name) {
      return apiValidationError("name is required");
    }

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("agents")
      .insert({
        name,
        contact_name: contact_name || null,
        contact_email: contact_email || null,
        contact_phone: contact_phone || null,
        address: address || null,
      })
      .select("id, name, contact_name, contact_email, contact_phone, address, status, commission_type, default_commission_rate, default_commission_fixed, created_at, updated_at")
      .single();

    if (error) {
      return apiInternalError(error, "agents POST");
    }

    return NextResponse.json({ agent: data }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agents POST");
  }
}
