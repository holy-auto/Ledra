import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiInternalError,
  apiNotFound,
  apiValidationError,
} from "@/lib/api/response";
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
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("agent_applications")
      .select(
        "id, application_number, company_name, contact_name, email, phone, industry, status, documents, rejection_reason, reviewed_by, reviewed_at, user_id, created_at, updated_at",
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return apiNotFound("application not found");
    }

    // Generate signed URLs for documents
    const documents =
      (data.documents as Array<{ name: string; storage_path: string; content_type: string; file_size: number }>) || [];
    const docsWithUrls = await Promise.all(
      documents.map(async (doc) => {
        const { data: signedData } = await admin.storage
          .from("agent-applications")
          .createSignedUrl(doc.storage_path, 3600); // 1 hour
        return { ...doc, url: signedData?.signedUrl || null };
      }),
    );

    return apiJson({ application: { ...data, documents: docsWithUrls } });
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
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const body = await request.json();
    const { status, rejection_reason } = body;
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // --- Mark as under_review ---
    if (status === "under_review") {
      const { data, error } = await admin
        .from("agent_applications")
        .update({ status: "under_review", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "submitted")
        .select(
          "id, application_number, company_name, contact_name, email, phone, industry, status, documents, rejection_reason, reviewed_by, reviewed_at, user_id, created_at, updated_at",
        )
        .single();

      if (error || !data) {
        return apiNotFound("application not found or not in submitted status");
      }
      return apiJson({ application: data });
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
        .select(
          "id, application_number, company_name, contact_name, email, phone, industry, status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at",
        )
        .single();

      if (error || !data) {
        return apiNotFound("application not found or already processed");
      }

      // Send rejection email
      await notifyApplicationRejected(data.email, {
        companyName: data.company_name,
        applicationNumber: data.application_number,
        rejectionReason: rejection_reason.trim(),
      }).catch((e) =>
        console.error("[admin/agent-applications] reject email error", {
          error: e instanceof Error ? e.message : String(e),
        }),
      );

      return apiJson({ application: data });
    }

    // --- Approve ---
    if (status === "approved") {
      // Fetch application
      const { data: app, error: fetchErr } = await admin
        .from("agent_applications")
        .select(
          "id, application_number, company_name, contact_name, email, phone, industry, status, documents, rejection_reason, reviewed_by, reviewed_at, user_id, created_at, updated_at",
        )
        .eq("id", id)
        .in("status", ["submitted", "under_review"])
        .single();

      if (fetchErr || !app) {
        return apiNotFound("application not found or already processed");
      }

      // Step 1: auth.users のユーザーを取得または作成
      //   - 既存ユーザー（施工店アカウントなど）の場合: 既存 user_id を使う
      //   - 新規ユーザーの場合: 新規作成して user_id を取得
      let userId: string;
      let tempPassword: string | null = null;
      let isExistingUser = false;

      // まず申請レコードに user_id が紐付いているか確認
      const existingUserId = (app as Record<string, unknown>).user_id as string | null;

      if (existingUserId) {
        // 申請時にすでに user_id が記録されている場合はそれを使う
        userId = existingUserId;
        isExistingUser = true;
      } else {
        // auth.users にメールが存在するか確認
        const { data: existingUsers } = await admin.auth.admin.listUsers();
        const matchedUser = existingUsers?.users?.find(
          (u: { id: string; email?: string }) => u.email?.toLowerCase() === app.email.toLowerCase(),
        );

        if (matchedUser) {
          // 既存ユーザーが見つかった → そのまま使う（パスワード変更なし）
          userId = matchedUser.id;
          isExistingUser = true;
        } else {
          // 新規ユーザーを作成
          tempPassword = crypto.randomBytes(12).toString("base64url");
          const { data: authData, error: authError } = await admin.auth.admin.createUser({
            email: app.email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { display_name: app.contact_name },
          });

          if (authError) {
            console.error("[admin/agent-applications] createUser error:", authError.message);
            return apiInternalError(authError, "agent-applications approve createUser");
          }
          userId = authData.user.id;
        }
      }

      // Step 2: Call RPC to atomically create agent + agent_users + update application
      const { data: agentId, error: rpcError } = await admin.rpc("approve_agent_application", {
        p_application_id: id,
        p_user_id: userId,
        p_reviewer_id: caller.userId,
      });

      if (rpcError) {
        console.error("[admin/agent-applications] RPC error:", rpcError.message);
        // 新規作成したユーザーの場合のみロールバック
        if (!isExistingUser) {
          await admin.auth.admin
            .deleteUser(userId)
            .catch((err: unknown) => console.error("[admin/agent-applications] rollback deleteUser failed:", err));
        }
        return apiInternalError(rpcError, "agent-applications approve RPC");
      }

      // Step 3: Send approval email
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://app.ledra.co.jp";
      await notifyApplicationApproved(app.email, {
        companyName: app.company_name,
        loginEmail: app.email,
        // 既存ユーザーの場合は仮パスワード不要（既存パスワードでログイン可能）
        temporaryPassword: tempPassword ?? "(既存のパスワードをご使用ください)",
        portalUrl: `${baseUrl}/agent/login`,
      }).catch((e) =>
        console.error("[admin/agent-applications] approve email error", {
          error: e instanceof Error ? e.message : String(e),
        }),
      );

      return apiJson({
        application: { ...app, status: "approved", agent_id: agentId },
        agent_id: agentId,
      });
    }

    return apiValidationError("invalid status. Must be: under_review, approved, rejected");
  } catch (e) {
    return apiInternalError(e, "agent-applications [id] PUT");
  }
}
