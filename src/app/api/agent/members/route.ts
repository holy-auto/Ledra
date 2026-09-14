import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { agentMemberInviteSchema } from "@/lib/validations/agent-portal";

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

    const parsed = await parseJsonBody(request, agentMemberInviteSchema);
    if (!parsed.ok) return parsed.response;
    const { email, role, display_name } = parsed.data;

    // Upsert the agent user via RPC
    // upsert_agent_user は SECURITY DEFINER で呼び出し元を検査しない。
    // service_role 専用にしたので、権限確認済みのここからサービスロールで呼ぶ
    const adminForRpc = createServiceRoleAdmin("agent flow — upsert_agent_user は service_role 専用");
    const { data: member, error: upsertErr } = await adminForRpc.rpc("upsert_agent_user", {
      p_agent_id: agentId,
      p_email: email,
      p_role: role,
      p_display_name: display_name ?? null,
    });

    if (upsertErr) {
      return apiInternalError(upsertErr, "agent/members upsert");
    }

    return apiJson({ ok: true, member }, { status: 201 });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/members POST");
  }
}
