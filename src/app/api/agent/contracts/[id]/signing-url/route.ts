import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/contracts/[id]/signing-url
 * 代理店契約書の自前電子署名 URL を返す。
 * 署名待ち（sent / viewed）の契約にのみアクセス可能。
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    // 代理店メンバーシップ確認
    const { data: agentStatus } = await supabase.rpc("get_my_agent_status");
    const agentRow = Array.isArray(agentStatus) ? agentStatus[0] : agentStatus;
    if (!agentRow?.agent_id) return apiForbidden("not_agent");

    // admin client で sign_token を含む完全なレコードを取得（RLS バイパス）
    const admin = createServiceRoleAdmin("agent flow — agent-scoped / token-based, not tenant-scoped");
    const { data: contract, error } = await admin
      .from("agent_signing_requests")
      .select("id, agent_id, status, sign_token, sign_expires_at, title")
      .eq("id", id)
      .eq("agent_id", agentRow.agent_id)
      .single();

    if (error || !contract) return apiNotFound("contract");

    if (!["sent", "viewed"].includes(contract.status)) {
      return apiJson({ error: "署名待ちの契約書ではありません" }, { status: 400 });
    }

    if (!contract.sign_token) {
      return apiJson({ error: "署名リンクが発行されていません" }, { status: 400 });
    }

    // トークン有効期限チェック
    if (contract.sign_expires_at && new Date(contract.sign_expires_at) < new Date()) {
      return apiJson({ error: "署名リンクの有効期限が切れています。本部に再送を依頼してください。" }, { status: 400 });
    }

    // 閲覧済みに更新（まだ sent の場合）
    if (contract.status === "sent") {
      await admin
        .from("agent_signing_requests")
        .update({ status: "viewed", updated_at: new Date().toISOString() })
        .eq("id", id);
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const signing_url = `${baseUrl}/agent-sign/${contract.sign_token}`;

    return apiJson({ signing_url });
  } catch (e) {
    return apiInternalError(e, "agent/contracts/signing-url GET");
  }
}
