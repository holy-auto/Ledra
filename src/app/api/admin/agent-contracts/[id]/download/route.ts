import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiForbidden, apiInternalError, apiNotFound } from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";

/**
 * GET /api/admin/agent-contracts/[id]/download
 * Download the signed PDF for a completed signing request.
 */
export const GET = withCaller<{ id: string }>(
  async (_request, { caller, supabase, params }) => {
    const { id } = params;
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin(
      "agent-contracts/[id]/download — platform-wide agent operations (no tenant scope)",
    );
    const { data, error } = await admin
      .from("agent_signing_requests")
      .select("id, signed_pdf_path, title, status")
      .eq("id", id)
      .single();

    if (error || !data) return apiNotFound("contract not found");
    if (data.status !== "signed" || !data.signed_pdf_path) {
      return apiNotFound("署名済みPDFはまだありません");
    }

    const { data: signedData, error: signErr } = await admin.storage
      .from("agent-shared-files")
      .createSignedUrl(data.signed_pdf_path, 300, {
        download: `${data.title}.pdf`,
      });

    if (signErr || !signedData?.signedUrl) {
      return apiInternalError(signErr, "admin/agent-contracts download signedUrl");
    }

    return apiJson({ url: signedData.signedUrl });
  },
  { routeName: "admin/agent-contracts/[id]/download GET" },
);
