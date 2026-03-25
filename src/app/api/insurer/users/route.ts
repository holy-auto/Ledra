import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiForbidden, apiInternalError, apiValidationError, apiNotFound } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * GET /api/insurer/users
 * List all users in the current insurer organization.
 */
export async function GET() {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("insurer_users")
      .select("id, user_id, role, display_name, is_active, created_at, updated_at")
      .eq("insurer_id", caller.insurerId)
      .order("created_at", { ascending: true });

    if (error) {
      return apiInternalError(error, "insurer users list");
    }

    // Batch-fetch all user emails via a single RPC call instead of N+1 getUserById
    const userIds = (data ?? []).map((iu) => iu.user_id);
    const emailMap = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: emailRows } = await admin.rpc("get_auth_emails_by_ids", {
        p_user_ids: userIds,
      });
      if (emailRows && Array.isArray(emailRows)) {
        for (const row of emailRows) {
          emailMap.set(row.id, row.email);
        }
      }
    }

    const users = (data ?? []).map((iu) => ({
      ...iu,
      email: emailMap.get(iu.user_id) ?? null,
    }));

    return NextResponse.json({ users });
  } catch (e) {
    return apiInternalError(e, "insurer users list");
  }
}

/**
 * PATCH /api/insurer/users
 * Update a user's role or deactivate them.
 * Body: { insurer_user_id: string, role?: string, is_active?: boolean }
 */
export async function PATCH(req: Request) {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();
    if (caller.role !== "admin") return apiForbidden("管理者のみユーザー管理が可能です。");

    let body: any;
    try {
      body = await req.json();
    } catch {
      return apiValidationError("invalid JSON");
    }

    const { insurer_user_id, role, is_active } = body;
    if (!insurer_user_id) {
      return apiValidationError("insurer_user_id is required");
    }

    const admin = createAdminClient();

    // Verify target user belongs to same insurer
    const { data: target } = await admin
      .from("insurer_users")
      .select("id, insurer_id, user_id, role")
      .eq("id", insurer_user_id)
      .eq("insurer_id", caller.insurerId)
      .single();

    if (!target) {
      return apiNotFound("ユーザーが見つかりません。");
    }

    // Prevent self-demotion from admin
    if (target.user_id === caller.userId && role && role !== "admin") {
      return apiValidationError("自分自身の管理者権限を変更することはできません");
    }

    // Prevent deactivating self
    if (target.user_id === caller.userId && is_active === false) {
      return apiValidationError("自分自身を無効化することはできません");
    }

    const updates: Record<string, any> = {};
    if (role !== undefined && ["admin", "viewer", "auditor"].includes(role)) {
      updates.role = role;
    }
    if (is_active !== undefined && typeof is_active === "boolean") {
      updates.is_active = is_active;
    }

    if (Object.keys(updates).length === 0) {
      return apiValidationError("更新するフィールドがありません。");
    }

    const { data: updated, error } = await admin
      .from("insurer_users")
      .update(updates)
      .eq("id", insurer_user_id)
      .eq("insurer_id", caller.insurerId)
      .select("id, role, is_active, display_name")
      .single();

    if (error) {
      return apiInternalError(error, "insurer users update");
    }

    return NextResponse.json({ ok: true, user: updated });
  } catch (e) {
    return apiInternalError(e, "insurer users update");
  }
}

/**
 * DELETE /api/insurer/users
 * Remove a user from the insurer organization.
 * Body: { insurer_user_id: string }
 */
export async function DELETE(req: Request) {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();
    if (caller.role !== "admin") return apiForbidden("管理者のみユーザー管理が可能です。");

    let body: any;
    try {
      body = await req.json();
    } catch {
      return apiValidationError("invalid JSON");
    }

    const { insurer_user_id } = body;
    if (!insurer_user_id) {
      return apiValidationError("insurer_user_id is required");
    }

    const admin = createAdminClient();

    // Verify target user belongs to same insurer
    const { data: target } = await admin
      .from("insurer_users")
      .select("id, insurer_id, user_id")
      .eq("id", insurer_user_id)
      .eq("insurer_id", caller.insurerId)
      .single();

    if (!target) {
      return apiNotFound("ユーザーが見つかりません。");
    }

    // Prevent self-deletion
    if (target.user_id === caller.userId) {
      return apiValidationError("自分自身を削除することはできません");
    }

    // Check there's at least one other admin remaining
    const { count: adminCount } = await admin
      .from("insurer_users")
      .select("id", { count: "exact", head: true })
      .eq("insurer_id", caller.insurerId)
      .eq("role", "admin")
      .eq("is_active", true)
      .neq("id", insurer_user_id);

    if ((adminCount ?? 0) < 1) {
      return apiValidationError("最後の管理者を削除することはできません。先に別の管理者を設定してください。");
    }

    const { error } = await admin
      .from("insurer_users")
      .delete()
      .eq("id", insurer_user_id)
      .eq("insurer_id", caller.insurerId);

    if (error) {
      return apiInternalError(error, "insurer users delete");
    }

    return NextResponse.json({ ok: true, deleted: insurer_user_id });
  } catch (e) {
    return apiInternalError(e, "insurer users delete");
  }
}
