import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";
import { getDocumentStatus } from "@/lib/agent/cloudsign";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/contracts/[id]/signing-url
 * Returns the CloudSign signing URL for an agent's contract.
 * Only accessible when contract status is 'sent' or 'viewed'.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    // Verify agent membership and get agent_id
    const { data: agentStatus } = await supabase.rpc("get_my_agent_status");
    const agentRow = Array.isArray(agentStatus) ? agentStatus[0] : agentStatus;
    if (!agentRow?.agent_id) return apiForbidden("not_agent");

    // Fetch the signing request (RLS ensures ownership)
    const admin = getAdminClient();
    const { data: contract, error } = await admin
      .from("agent_signing_requests")
      .select("id, agent_id, status, cloudsign_document_id, title")
      .eq("id", id)
      .eq("agent_id", agentRow.agent_id)
      .single();

    if (error || !contract) return apiNotFound("contract");

    if (!["sent", "viewed"].includes(contract.status)) {
      return NextResponse.json(
        { error: "Contract is not awaiting signature" },
        { status: 400 },
      );
    }

    if (!contract.cloudsign_document_id) {
      return NextResponse.json(
        { error: "No CloudSign document associated with this contract" },
        { status: 400 },
      );
    }

    // Skip CloudSign API call for demo document IDs (no real CloudSign keys needed)
    if (contract.cloudsign_document_id.startsWith("demo-")) {
      return NextResponse.json({
        signing_url: null,
        demo: true,
        message: "デモ用契約書のため、実際のCloudSign署名URLはありません。",
      });
    }

    // Get signing URL from CloudSign
    const doc = await getDocumentStatus(contract.cloudsign_document_id);

    // Mark as viewed if previously only 'sent'
    if (contract.status === "sent") {
      await admin
        .from("agent_signing_requests")
        .update({ status: "viewed" })
        .eq("id", id);
    }

    return NextResponse.json({ signing_url: doc.signing_url ?? null });
  } catch (e) {
    return apiInternalError(e, "agent/contracts/signing-url GET");
  }
}
