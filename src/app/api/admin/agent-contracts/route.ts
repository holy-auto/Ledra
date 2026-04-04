import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import {
  getTemplateId,
  createDocumentFromTemplate,
  addParticipant,
  sendSigningRequest,
} from "@/lib/agent/cloudsign";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/agent-contracts?agent_id=xxx
 * List signing requests for a specific agent.
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
      .select("id, agent_id, template_type, title, cloudsign_document_id, status, signer_email, signer_name, sent_at, signed_at, signed_pdf_path, requested_by, created_at, updated_at")
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
 * Create a signing request and send via CloudSign.
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

    // Verify agent exists
    const { data: agent, error: agentErr } = await admin
      .from("agents")
      .select("id")
      .eq("id", agent_id)
      .single();
    if (agentErr || !agent) return apiValidationError("agent not found");

    // Step 1: Get template ID
    const templateId = getTemplateId(template_type);

    // Step 2: Create document from template
    const doc = await createDocumentFromTemplate(templateId, title.trim());

    // Step 3: Add participant
    await addParticipant(doc.id, signer_email.trim(), signer_name.trim());

    // Step 4: Send signing request
    await sendSigningRequest(doc.id);

    // Step 5: Insert DB record
    const { data: record, error: insertErr } = await admin
      .from("agent_signing_requests")
      .insert({
        agent_id,
        template_type,
        title: title.trim(),
        cloudsign_document_id: doc.id,
        status: "sent",
        signer_email: signer_email.trim(),
        signer_name: signer_name.trim(),
        sent_at: new Date().toISOString(),
        requested_by: caller.userId,
      })
      .select("id, agent_id, template_type, title, cloudsign_document_id, status, signer_email, signer_name, sent_at, requested_by, created_at, updated_at")
      .single();

    if (insertErr) throw insertErr;

    return NextResponse.json({ contract: record }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "admin/agent-contracts POST");
  }
}
