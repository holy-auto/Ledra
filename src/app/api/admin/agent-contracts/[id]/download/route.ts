import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError, apiNotFound } from "@/lib/api/response";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/agent-contracts/[id]/download
 * Download the signed PDF for a completed signing request.
 */
export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
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
  } catch (e) {
    return apiInternalError(e, "admin/agent-contracts [id] download GET");
  }
}
