import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AgentStatus, AgentRole } from "@/types/agent";

type AgentContext = {
  agentId: string;
  status: AgentStatus;
  role: AgentRole;
  agentName: string;
  userId: string;
};

/**
 * API route 用: agent のステータスをチェックし、active 以外なら Response を返す。
 * active なら null を返す（= 通過OK）。
 *
 * Usage:
 *   const deny = await enforceAgentStatus();
 *   if (deny) return deny;
 */
export async function enforceAgentStatus(opts?: {
  allowPending?: boolean;
}): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("get_my_agent_status");

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return NextResponse.json(
      { error: "agent not found" },
      { status: 403 }
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  const status = row.status as AgentStatus;

  if (status === "suspended") {
    return NextResponse.json(
      {
        error: "account_suspended",
        message: "このアカウントは停止されています。管理者にお問い合わせください。",
      },
      { status: 403 }
    );
  }

  if (status === "active_pending_review" && !opts?.allowPending) {
    return NextResponse.json(
      {
        error: "feature_restricted",
        message:
          "現在アカウントは確認中です。この機能は正式開通後にご利用いただけます。",
      },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Resolve the current agent context from the authenticated user.
 * Returns null if user is not an agent.
 */
export async function resolveAgentContext(): Promise<AgentContext | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const { data, error } = await supabase.rpc("get_my_agent_status");
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null;

  const row = Array.isArray(data) ? data[0] : data;
  return {
    agentId: row.agent_id,
    status: row.status as AgentStatus,
    role: row.role as AgentRole,
    agentName: row.agent_name,
    userId: auth.user.id,
  };
}
