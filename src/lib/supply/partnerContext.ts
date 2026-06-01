/**
 * 供給パートナーのサーバ側コンテキスト解決 (代理店アカウント統合版)。
 *
 * 方針: パートナー ≡ 代理店 (agents)。ログイン中ユーザーが属する代理店
 * (get_my_agent_status) に紐づく supply_partner を解決する。まだ無ければ
 * その代理店用に 1 件自動プロビジョニングする (商材を扱う代理店はそのまま
 * 供給パートナーになれる = 別オンボーディング不要)。
 *
 * 旧 /supply 専用ポータルは廃止し、本コンテキストは /agent 配下の
 * 商材カタログ・API 連携ページ + /api/agent/supply/* から使う。
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { normalizeSupplyPartnerStatus, type SupplyPartnerStatus } from "@/types/supply";

export interface SupplyPartnerContext {
  partnerId: string;
  status: SupplyPartnerStatus;
  name: string;
  userId: string;
  agentId: string;
}

interface AgentStatusRow {
  agent_id: string;
  status: string;
  role: string;
  agent_name: string;
}

/** ログイン中ユーザーの代理店 (agent) を get_my_agent_status で解決する。 */
async function resolveAgent(): Promise<{ userId: string; agent: AgentStatusRow } | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const { data, error } = await supabase.rpc("get_my_agent_status");
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
  const agent = (Array.isArray(data) ? data[0] : data) as AgentStatusRow;
  if (!agent?.agent_id) return null;
  return { userId: auth.user.id, agent };
}

/**
 * 認証ユーザーの代理店に紐づく supply_partner を解決する。
 * 代理店でなければ null。代理店だが supply_partner 未作成なら自動作成する。
 *
 * @param provision false なら未作成時に作らず null を返す (読み取り専用の参照用)。
 */
export async function resolveSupplyPartnerContext(
  opts: { provision?: boolean } = {},
): Promise<SupplyPartnerContext | null> {
  const resolved = await resolveAgent();
  if (!resolved) return null;
  const { userId, agent } = resolved;

  const supabase = await createClient();
  // RLS (my_supply_partner_ids = agent 経由) によりこの代理店の行のみ見える。
  const { data: existing } = await supabase
    .from("supply_partners")
    .select("id, name, status")
    .eq("agent_id", agent.agent_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      partnerId: existing.id as string,
      status: normalizeSupplyPartnerStatus(existing.status as string),
      name: (existing.name as string) ?? agent.agent_name ?? "",
      userId,
      agentId: agent.agent_id,
    };
  }

  if (opts.provision === false) return null;

  // 自動プロビジョニング: この代理店用の supply_partner を 1 件作成する。
  // RLS の INSERT ポリシーは owner_user_id=auth.uid() を要求するため、
  // agent_id を立てつつ owner_user_id も記録する。status は代理店の状態に追従
  // (active な代理店なら active、それ以外は審査待ち) させる。RLS 越しの
  // agent_id 紐付け (運営のみ変更可トリガ) を確実に通すため service-role で作成する。
  const initialStatus: SupplyPartnerStatus = agent.status === "active" ? "active" : "active_pending_review";
  const admin = createServiceRoleAdmin(
    "supply: 代理店アカウントに対する supply_partner の初回自動プロビジョニング (agent_id 紐付け + status 追従)",
  );
  const { data: created, error } = await admin
    .from("supply_partners")
    .insert({
      name: agent.agent_name || "代理店",
      agent_id: agent.agent_id,
      owner_user_id: userId,
      status: initialStatus,
    })
    .select("id, name, status")
    .single();
  if (error || !created) return null;

  return {
    partnerId: created.id as string,
    status: normalizeSupplyPartnerStatus(created.status as string),
    name: (created.name as string) ?? agent.agent_name ?? "",
    userId,
    agentId: agent.agent_id,
  };
}

/**
 * API route 用ガード。active な代理店パートナーなら context を、そうでなければ Response を返す。
 *
 * Usage:
 *   const gate = await requireActiveSupplyPartner();
 *   if (gate instanceof NextResponse) return gate;
 */
export async function requireActiveSupplyPartner(opts?: {
  allowPending?: boolean;
}): Promise<SupplyPartnerContext | NextResponse> {
  const ctx = await resolveSupplyPartnerContext({ provision: true });
  if (!ctx) {
    return NextResponse.json({ error: "supply partner not found" }, { status: 403 });
  }
  if (ctx.status === "suspended") {
    return NextResponse.json(
      { error: "account_suspended", message: "このアカウントは停止されています。" },
      { status: 403 },
    );
  }
  if (ctx.status === "active_pending_review" && !opts?.allowPending) {
    return NextResponse.json(
      { error: "feature_restricted", message: "現在アカウントは審査中です。正式開通後にご利用いただけます。" },
      { status: 403 },
    );
  }
  return ctx;
}
