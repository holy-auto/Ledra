import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError, apiNotFound, apiValidationError } from "@/lib/api/response";
import { notifyApplicationApproved, notifyApplicationRejected } from "@/lib/agent/email";
import crypto from "crypto";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/agent-applications/[id]
 * Get full details of a single application.
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
      .from("agent_applications")
      .select("id, application_number, company_name, contact_name, email, phone, address, industry, qualifications, track_record, documents, status, rejection_reason, created_at, updated_at")
      .eq("id", id)
      .single();

    if (error || !data) {
      return apiNotFound("application not found");
    }

    // Generate signed URLs for documents
    const documents = (data.documents as Array<{ name: string; storage_path: string; content_type: string; file_size: number }>) || [];
    const docsWithUrls = await Promise.all(
      documents.map(async (doc) => {
        const { data: signedData } = await admin.storage
          .from("agent-applications")
          .createSignedUrl(doc.storage_path, 3600); // 1 hour
        return { ...doc, url: signedData?.signedUrl || null };
      }),
    );

    return NextResponse.json({ application: { ...data, documents: docsWithUrls } });
  } catch (e) {
    return apiInternalError(e, "agent-applications [id] GET");
  }
}

/**
 * PUT /api/admin/agent-applications/[id]
 * Update application status: under_review, approved, rejected.
 */
export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = await request.json();
    const { status, rejection_reason } = body;
    const admin = getAdminClient();

    // --- Mark as under_review ---
    if (status === "under_review") {
      const { data, error } = await admin
        .from("agent_applications")
        .update({ status: "under_review", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "submitted")
        .select()
        .single();

      if (error || !data) {
        return apiNotFound("application not found or not in submitted status");
      }
      return NextResponse.json({ application: data });
    }

    // --- Reject ---
    if (status === "rejected") {
      if (!rejection_reason?.trim()) {
        return apiValidationError("rejection_reason is required");
      }

      const { data, error } = await admin
        .from("agent_applications")
        .update({
          status: "rejected",
          rejection_reason: rejection_reason.trim(),
          reviewed_by: caller.userId,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .in("status", ["submitted", "under_review"])
        .select()
        .single();

      if (error || !data) {
        return apiNotFound("application not found or already processed");
      }

      // Send rejection email
      await notifyApplicationRejected(data.email, {
        companyName: data.company_name,
        applicationNumber: data.application_number,
        rejectionReason: rejection_reason.trim(),
      }).catch((e) => console.error("[admin/agent-applications] reject email error:", e));

      return NextResponse.json({ application: data });
    }

    // --- Approve ---
    if (status === "approved") {
      // Fetch application
      const { data: app, error: fetchErr } = await admin
        .from("agent_applications")
        .select("id, application_number, company_name, contact_name, email, phone, address, industry, qualifications, track_record, documents, status, rejection_reason, agent_id, created_at, updated_at")
        .eq("id", id)
        .in("status", ["submitted", "under_review"])
        .single();

      if (fetchErr || !app) {
        return apiNotFound("application not found or already processed");
      }

      // Step 1: Generate temporary password
      const tempPassword = crypto.randomBytes(12).toString("base64url");

      // Step 2: Create auth user
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email: app.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { display_name: app.contact_name },
      });

      if (authError) {
        const msg = authError.message ?? "";
        console.error("[admin/agent-applications] createUser error:", msg);

        if (msg.includes("already been registered") || msg.includes("already exists")) {
          return NextResponse.json(
            { error: "email_exists", message: "このメールアドレスは既に登録されています" },
            { status: 409 },
          );
        }
        return apiInternalError(authError, "agent-applications approve createUser");
      }

      const userId = authData.user.id;

      // Step 3: Call RPC to atomically create agent + agent_users + update application
      const { data: agentId, error: rpcError } = await admin.rpc("approve_agent_application", {
        p_application_id: id,
        p_user_id: userId,
        p_reviewer_id: caller.userId,
      });

      if (rpcError) {
        console.error("[admin/agent-applications] RPC error, rolling back auth user:", rpcError.message);
        await admin.auth.admin.deleteUser(userId).catch((err: unknown) =>
          console.error("[admin/agent-applications] rollback deleteUser failed:", err),
        );
        return apiInternalError(rpcError, "agent-applications approve RPC");
      }

      // Step 4: Send approval email
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://app.ledra.co.jp";
      await notifyApplicationApproved(app.email, {
        companyName: app.company_name,
        loginEmail: app.email,
        temporaryPassword: tempPassword,
        portalUrl: `${baseUrl}/agent/login`,
      }).catch((e) => console.error("[admin/agent-applications] approve email error:", e));

      return NextResponse.json({
        application: { ...app, status: "approved", agent_id: agentId },
        agent_id: agentId,
      });
    }

    return apiValidationError("invalid status. Must be: under_review, approved, rejected");
  } catch (e) {
    return apiInternalError(e, "agent-applications [id] PUT");
  }
}
