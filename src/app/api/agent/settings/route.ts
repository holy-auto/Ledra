import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiInternalError,
  apiValidationError,
} from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { agentSettingsUpdateSchema } from "@/lib/validations/agent-portal";
import { AGENT_PROFILE_COLUMNS, toAgentPatch, type AgentBankInfo } from "@/lib/agents/profileColumns";

export const dynamic = "force-dynamic";

// ─── GET: Agent profile settings and current user's role ───
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

    // Fetch agent profile
    const { data: profile, error: profileErr } = await supabase
      .from("agents")
      .select(AGENT_PROFILE_COLUMNS)
      .eq("id", agentId)
      .single();

    if (profileErr || !profile) {
      return apiNotFound("agent_profile_not_found");
    }

    // Fetch current user's role in this agent org
    const { data: membership, error: memberErr } = await supabase
      .from("agent_users")
      .select("role, display_name")
      .eq("agent_id", agentId)
      .eq("user_id", auth.user.id)
      .single();

    if (memberErr) {
      console.error("[agent/settings] membership fetch error:", memberErr.message);
    }

    return apiJson({
      agent: profile,
      current_user: {
        user_id: auth.user.id,
        role: membership?.role ?? agent.role ?? "viewer",
        display_name: membership?.display_name ?? null,
      },
    });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/settings GET");
  }
}

// ─── PUT: Update agent profile settings ───
export async function PUT(request: NextRequest) {
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
    const role = agent.role as string;

    // Only admin can update settings
    if (role !== "admin") {
      return apiForbidden("設定を更新する権限がありません。");
    }

    const parsed = await parseJsonBody(request, agentSettingsUpdateSchema);
    if (!parsed.ok) return parsed.response;

    // 振込先は bank_info（jsonb）に入るので、1項目だけ更新したときに他が
    // 消えないよう既存の中身を読んでから重ねる
    const { data: current } = await supabase.from("agents").select("bank_info").eq("id", agentId).maybeSingle();

    // agents の実列に載せ替える。以前は検証済みの値をそのまま update に渡していたが、
    // company_name / company_address / logo_url / commission_rate / bank_* は
    // agents に**存在しない列**で、送られると update ごと失敗していた。
    const { unsupported, patch } = toAgentPatch(parsed.data, current?.bank_info as AgentBankInfo | null);
    if (unsupported.length > 0) {
      // 黙って捨てない。保存できない項目があることを呼び出し元に返す
      return apiValidationError(`この項目は現在保存できません: ${unsupported.join(", ")}`);
    }
    const updates: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };

    const { data: updated, error: updateErr } = await supabase
      .from("agents")
      .update(updates)
      .eq("id", agentId)
      .select(AGENT_PROFILE_COLUMNS)
      .single();

    if (updateErr) {
      return apiInternalError(updateErr, "agent/settings update");
    }

    return apiJson({ ok: true, agent: updated });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/settings PUT");
  }
}
