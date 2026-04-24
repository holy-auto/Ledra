import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── GET: List agent members ───
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return apiUnauthorized();
    }

    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return apiForbidden("agent_not_found");
    }

    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    const agentId = agent.agent_id as string;

    // Fetch all agent_users for this agent
    const { data: members, error } = await supabase
      .from("agent_users")
      .select("id, user_id, agent_id, role, display_name, created_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: true });

    if (error) {
      return apiInternalError(error, "agent/members query");
    }

    // Enrich with email from auth.users via admin client
    const admin = createServiceRoleAdmin("agent flow — agent-scoped, not tenant-scoped");
    const enriched = await Promise.all(
      (members ?? []).map(async (m) => {
        let email: string | null = null;
        if (m.user_id) {
          const { data } = await admin.auth.admin.getUserById(m.user_id);
          email = data?.user?.email ?? null;
        }
        return {
          id: m.id,
          user_id: m.user_id,
          role: m.role ?? "viewer",
          display_name: m.display_name ?? null,
          email,
          created_at: m.created_at,
          is_self: m.user_id === auth.user.id,
        };
      }),
    );

    return apiJson({ members: enriched });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/members GET");
  }
}

// ─── POST: Invite / add a member to the agent organization ───
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return apiUnauthorized();
    }

    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return apiForbidden("agent_not_found");
    }

    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    const agentId = agent.agent_id as string;
    const callerRole = agent.role as string;

    // Only admin can invite members
    if (callerRole !== "admin") {
      return apiForbidden("メンバーを招待する権限がありません。");
    }

    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const email = ((body?.email as string) ?? "").trim().toLowerCase();
    const role = ((body?.role as string) ?? "").trim() || "viewer";
    const displayName = ((body?.display_name as string) ?? "").trim() || null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiValidationError("有効なメールアドレスを入力してください。");
    }

    const validRoles = ["admin", "staff", "viewer"];
    if (!validRoles.includes(role)) {
      return apiValidationError("無効なロールです。admin, staff, viewer のいずれかを指定してください。");
    }

    // Upsert the agent user via RPC
    const { data: member, error: upsertErr } = await supabase.rpc("upsert_agent_user", {
      p_agent_id: agentId,
      p_email: email,
      p_role: role,
      p_display_name: displayName,
    });

    if (upsertErr) {
      return apiInternalError(upsertErr, "agent/members upsert");
    }

    return apiJson({ ok: true, member }, { status: 201 });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/members POST");
  }
}
