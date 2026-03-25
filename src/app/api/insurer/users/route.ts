import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

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
      console.error("[insurer-users] list error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
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
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    const { insurer_user_id, role, is_active } = body;
    if (!insurer_user_id) {
      return NextResponse.json({ error: "insurer_user_id is required" }, { status: 400 });
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
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    // Prevent self-demotion from admin
    if (target.user_id === caller.userId && role && role !== "admin") {
      return NextResponse.json(
        { error: "cannot_demote_self", message: "自分自身の管理者権限を変更することはできません" },
        { status: 400 },
      );
    }

    // Prevent deactivating self
    if (target.user_id === caller.userId && is_active === false) {
      return NextResponse.json(
        { error: "cannot_deactivate_self", message: "自分自身を無効化することはできません" },
        { status: 400 },
      );
    }

    const updates: Record<string, any> = {};
    if (role !== undefined && ["admin", "viewer", "auditor"].includes(role)) {
      updates.role = role;
    }
    if (is_active !== undefined && typeof is_active === "boolean") {
      updates.is_active = is_active;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "no_updates" }, { status: 400 });
    }

    const { data: updated, error } = await admin
      .from("insurer_users")
      .update(updates)
      .eq("id", insurer_user_id)
      .eq("insurer_id", caller.insurerId)
      .select("id, role, is_active, display_name")
      .single();

    if (error) {
      console.error("[insurer-users] update error:", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
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
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    const { insurer_user_id } = body;
    if (!insurer_user_id) {
      return NextResponse.json({ error: "insurer_user_id is required" }, { status: 400 });
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
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    // Prevent self-deletion
    if (target.user_id === caller.userId) {
      return NextResponse.json(
        { error: "cannot_delete_self", message: "自分自身を削除することはできません" },
        { status: 400 },
      );
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
      return NextResponse.json(
        { error: "last_admin", message: "最後の管理者を削除することはできません。先に別の管理者を設定してください。" },
        { status: 400 },
      );
    }

    const { error } = await admin
      .from("insurer_users")
      .delete()
      .eq("id", insurer_user_id)
      .eq("insurer_id", caller.insurerId);

    if (error) {
      console.error("[insurer-users] delete error:", error.message);
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: insurer_user_id });
  } catch (e) {
    return apiInternalError(e, "insurer users delete");
  }
}
