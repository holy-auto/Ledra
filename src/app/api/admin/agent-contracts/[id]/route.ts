import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError, apiNotFound, apiValidationError } from "@/lib/api/response";
import { getDocumentStatus, sendSigningRequest } from "@/lib/agent/cloudsign";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/agent-contracts/[id]
 * Get full details of a signing request.
 */
export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("agent_signing_requests")
      .select("id, agent_id, template_type, title, cloudsign_document_id, status, signer_email, signer_name, sent_at, signed_at, signed_pdf_path, requested_by, created_at, updated_at")
      .eq("id", id)
      .single();

    if (error || !data) return apiNotFound("contract not found");

    // Optionally refresh status from CloudSign
    let cloudsignStatus = null;
    if (data.cloudsign_document_id && ["sent", "viewed"].includes(data.status)) {
      try {
        cloudsignStatus = await getDocumentStatus(data.cloudsign_document_id);
      } catch {
        // Non-critical — just return DB state
      }
    }

    return NextResponse.json({ contract: data, cloudsign_status: cloudsignStatus });
  } catch (e) {
    return apiInternalError(e, "admin/agent-contracts [id] GET");
  }
}

/**
 * PUT /api/admin/agent-contracts/[id]
 * Re-send or cancel a signing request.
 * Body: { action: "resend" | "cancel" }
 */
export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = await request.json();
    const { action } = body;
    const admin = getAdminClient();

    const { data: record, error: fetchErr } = await admin
      .from("agent_signing_requests")
      .select("id, agent_id, template_type, title, cloudsign_document_id, status, signer_email, signer_name, sent_at, signed_at, signed_pdf_path, requested_by, created_at, updated_at")
      .eq("id", id)
      .single();

    if (fetchErr || !record) return apiNotFound("contract not found");

    if (action === "resend") {
      if (!["sent", "viewed"].includes(record.status)) {
        return apiValidationError("再送は送信済み/閲覧済みのリクエストのみ可能です");
      }
      if (!record.cloudsign_document_id) {
        return apiValidationError("CloudSignドキュメントIDがありません");
      }

      await sendSigningRequest(record.cloudsign_document_id);

      const { data: updated } = await admin
        .from("agent_signing_requests")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", id)
        .select("id, agent_id, template_type, title, cloudsign_document_id, status, signer_email, signer_name, sent_at, signed_at, signed_pdf_path, requested_by, created_at, updated_at")
        .single();

      return NextResponse.json({ contract: updated });
    }

    if (action === "cancel") {
      if (["signed", "expired"].includes(record.status)) {
        return apiValidationError("署名完了・期限切れのリクエストはキャンセルできません");
      }

      const { data: updated } = await admin
        .from("agent_signing_requests")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id, agent_id, template_type, title, cloudsign_document_id, status, signer_email, signer_name, sent_at, signed_at, signed_pdf_path, requested_by, created_at, updated_at")
        .single();

      return NextResponse.json({ contract: updated });
    }

    return apiValidationError("invalid action. Must be: resend, cancel");
  } catch (e) {
    return apiInternalError(e, "admin/agent-contracts [id] PUT");
  }
}
