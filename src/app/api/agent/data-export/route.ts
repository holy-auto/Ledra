/**
 * GET /api/agent/data-export
 *
 * GDPR / 個人情報保護法対応: 認証済み代理店 (Agent) が、自身に紐づく
 * データを JSON でエクスポートする。
 *
 * スコープ:
 *   - agent 本体 (会社情報・連絡先・stripe_connect_account_id)
 *   - agent_referrals (紹介履歴)
 *   - agent_commissions (報酬履歴)
 *   - agent_payouts (支払い履歴)
 *   - agent_training_completions (学習履歴)
 *
 * 権限: 認証済み + RPC `get_my_agent_status` で active な agent_id が
 *       解決できること。他代理店のデータは含まれない (`.eq("agent_id", ...)`)。
 *
 * 出力: application/json (Content-Disposition: attachment).
 * Rate limit: 3/h per agent.
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiUnauthorized, apiForbidden, apiJson, apiInternalError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { setSentryAgentContext } from "@/lib/sentryContext";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ExportSection {
  table: string;
  count: number;
  rows: Array<Record<string, unknown>>;
}

async function fetchByAgent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  agentId: string,
  table: string,
  limit = 10_000,
): Promise<ExportSection> {
  const { data, error } = await admin.from(table).select("*").eq("agent_id", agentId).limit(limit);
  if (error) {
    logger.warn("agent/data-export: section query failed", { table, agentId, error: error.message });
    return { table, count: 0, rows: [] };
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return { table, count: rows.length, rows };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return apiForbidden("agent_not_found");
    }
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    const agentId = agent.agent_id as string;
    // Sentry: ensure errors raised below carry the agent_id tag for triage.
    setSentryAgentContext({ userId: auth.user.id, agentId });

    // Rate limit: 3/h per (agent, user).
    const rlKey = `agent-data-export:${agentId}:${auth.user.id || getClientIp(req)}`;
    const rl = await checkRateLimit(rlKey, { limit: 3, windowSec: 3600 });
    if (!rl.allowed) {
      return apiJson(
        { error: "rate_limited", message: "エクスポート回数の上限に達しました。1時間後に再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    // Use service role to fetch agent_* tables; RLS would also work but the
    // RPC already confirmed ownership, and several agent tables are
    // service-role only (`agent_payouts` doesn't have user-facing RLS).
    const admin = createServiceRoleAdmin(
      "agent/data-export — pre-resolved agent_id via get_my_agent_status RPC, scoped to that agent only",
    );

    // The agent row itself (single).
    const { data: agentRow } = await admin
      .from("agents")
      .select(
        "id, name, contact_name, contact_email, contact_phone, address, status, " +
          "stripe_account_id, stripe_onboarding_done, created_at, updated_at",
      )
      .eq("id", agentId)
      .maybeSingle();

    const [referrals, commissions, payouts, training] = await Promise.all([
      fetchByAgent(admin, agentId, "agent_referrals"),
      fetchByAgent(admin, agentId, "agent_commissions"),
      fetchByAgent(admin, agentId, "agent_payouts"),
      fetchByAgent(admin, agentId, "agent_training_completions"),
    ]);

    const generatedAt = new Date().toISOString();
    const filename = `ledra-agent-export-${agentId.slice(0, 8)}-${generatedAt.slice(0, 10)}.json`;

    const payload = {
      schema_version: "1.0",
      generated_at: generatedAt,
      agent: agentRow,
      exported_by: { user_id: auth.user.id },
      sections: {
        agent_referrals: referrals,
        agent_commissions: commissions,
        agent_payouts: payouts,
        agent_training_completions: training,
      },
      metadata: {
        notice:
          "本データは個人情報保護法第33条 / GDPR 第15条に基づき、認証済み代理店アカウントに" +
          "紐づくすべての記録を含みます。他代理店・他テナントの情報は含まれていません。",
        excluded: "auth.users (Supabase 直接管理) / stripe_account 詳細 (Stripe ダッシュボード経由) は対象外です。",
      },
    };

    logger.info("agent data export issued", {
      agentId,
      userId: auth.user.id,
      counts: {
        referrals: referrals.count,
        commissions: commissions.count,
        payouts: payouts.count,
        training: training.count,
      },
    });

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store, max-age=0",
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/data-export");
  }
}
