import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { notifyAgentSignRequest } from "@/lib/agent/email";

export const dynamic = "force-dynamic";

/** トークン有効期間: 7 日 */
const TOKEN_TTL_DAYS = 7;

function generateSignToken(): string {
  return randomBytes(32).toString("hex");
}

function tokenExpiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + TOKEN_TTL_DAYS);
  return d.toISOString();
}

/**
 * GET /api/admin/agent-contracts?agent_id=xxx
 * 代理店の署名依頼一覧を返す。
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const agentId = request.nextUrl.searchParams.get("agent_id");
    if (!agentId) return apiValidationError("agent_id is required");

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("agent_signing_requests")
      .select(
        "id, agent_id, template_type, title, status, signer_email, signer_name, sent_at, signed_at, signed_pdf_path, requested_by, created_at, updated_at",
      )
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ contracts: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "admin/agent-contracts GET");
  }
}

/**
 * POST /api/admin/agent-contracts
 * 署名依頼を作成し、署名 URL（自前電子署名）を返す。
 *
 * Body: { agent_id, template_type, title, signer_email, signer_name }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = await request.json();
    const { agent_id, template_type, title, signer_email, signer_name } = body;

    if (!agent_id) return apiValidationError("agent_id is required");
    if (!template_type) return apiValidationError("template_type is required");
    if (!title?.trim()) return apiValidationError("title is required");
    if (!signer_email?.trim()) return apiValidationError("signer_email is required");
    if (!signer_name?.trim()) return apiValidationError("signer_name is required");

    const admin = getAdminClient();

    // 代理店の存在確認
    const { data: agent, error: agentErr } = await admin.from("agents").select("id").eq("id", agent_id).single();
    if (agentErr || !agent) return apiValidationError("agent not found");

    const signToken = generateSignToken();
    const signExpiresAt = tokenExpiresAt();
    const now = new Date().toISOString();

    const { data: record, error: insertErr } = await admin
      .from("agent_signing_requests")
      .insert({
        agent_id,
        template_type,
        title: title.trim(),
        status: "sent",
        signer_email: signer_email.trim(),
        signer_name: signer_name.trim(),
        sent_at: now,
        sign_token: signToken,
        sign_expires_at: signExpiresAt,
        requested_by: caller.userId,
      })
      .select(
        "id, agent_id, template_type, title, status, signer_email, signer_name, sent_at, signed_at, requested_by, created_at, updated_at",
      )
      .single();

    if (insertErr) throw insertErr;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const signUrl = `${baseUrl}/agent-sign/${signToken}`;

    await notifyAgentSignRequest(signer_email.trim(), {
      signerName: signer_name.trim(),
      title: title.trim(),
      signUrl,
      expiresAt: signExpiresAt,
      idempotencyKey: `agent-contract-send:${record.id}`,
    });

    return NextResponse.json({ contract: record, sign_url: signUrl }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "admin/agent-contracts POST");
  }
}
