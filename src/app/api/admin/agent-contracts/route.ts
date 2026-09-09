import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { parsePagination } from "@/lib/api/pagination";
import { agentContractCreateSchema } from "@/lib/validations/agent-content";
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
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const agentId = request.nextUrl.searchParams.get("agent_id");
    if (!agentId) return apiValidationError("agent_id is required");

    const admin = createPlatformScopedAdmin("agent-contracts — platform-wide agent operations (no tenant scope)");
    const p = parsePagination(request, { defaultPerPage: 50, maxPerPage: 200 });

    let query = admin
      .from("agent_signing_requests")
      .select(
        "id, agent_id, template_type, title, status, signer_email, signer_name, sent_at, signed_at, signed_pdf_path, requested_by, created_at, updated_at",
        { count: "exact" },
      )
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false });

    if (p.page > 0) query = query.range(p.from, p.to);
    else query = query.limit(p.perPage);

    const { data, error, count } = await query;
    if (error) throw error;

    return apiJson({
      contracts: data ?? [],
      page: p.page,
      per_page: p.perPage,
      total: count ?? null,
    });
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
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = await parseJsonBody(request, agentContractCreateSchema);
    if (!parsed.ok) return parsed.response;
    const { agent_id, template_type, title, signer_email, signer_name } = parsed.data;

    const admin = createPlatformScopedAdmin("agent-contracts — platform-wide agent operations (no tenant scope)");

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
        title,
        status: "sent",
        signer_email,
        signer_name,
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

    await notifyAgentSignRequest(signer_email, {
      signerName: signer_name,
      title,
      signUrl,
      expiresAt: signExpiresAt,
      idempotencyKey: `agent-contract-send:${record.id}`,
    });

    return apiJson({ contract: record, sign_url: signUrl }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "admin/agent-contracts POST");
  }
}
