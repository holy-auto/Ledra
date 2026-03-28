import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiForbidden, apiInternalError, apiValidationError, apiNotFound } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * GET /api/insurer/users
 * List all users in the current insurer organization.
 * Admin only — returns users with email, role, is_active, max_users.
 */
export async function GET() {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();
    if (caller.role !== "admin") return apiForbidden("管理者のみユーザー一覧を表示できます。");

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

    // Fetch max_users from insurers table
    const { data: insurer } = await admin
      .from("insurers")
      .select("max_users")
      .eq("id", caller.insurerId)
      .maybeSingle();

    return NextResponse.json({
      users,
      max_users: insurer?.max_users ?? 5,
    });
  } catch (e) {
    return apiInternalError(e, "insurer users list");
  }
}

/**
 * POST /api/insurer/users
 * Invite a new user to the insurer organization.
 * Body: { email: string, role: string, display_name?: string }
 * Admin only. Checks max_users limit.
 */
export async function POST(req: Request) {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();
    if (caller.role !== "admin") return apiForbidden("管理者のみユーザーを招待できます。");

    let body: any;
    try {
      body = await req.json();
    } catch {
      return apiValidationError("invalid JSON");
    }

    const { email, role, display_name } = body;
    if (!email || typeof email !== "string") {
      return apiValidationError("メールアドレスは必須です。");
    }
    if (!role || !["admin", "viewer", "auditor"].includes(role)) {
      return apiValidationError("ロールは admin / viewer / auditor のいずれかを指定してください。");
    }

    const admin = createAdminClient();

    // Check max_users limit
    const { data: insurer } = await admin
      .from("insurers")
      .select("max_users")
      .eq("id", caller.insurerId)
      .maybeSingle();

    const maxUsers = insurer?.max_users ?? 5;

    const { count: currentCount } = await admin
      .from("insurer_users")
      .select("id", { count: "exact", head: true })
      .eq("insurer_id", caller.insurerId)
      .eq("is_active", true);

    if ((currentCount ?? 0) >= maxUsers) {
      return apiValidationError(
        `ユーザー数の上限（${maxUsers}名）に達しています。プランのアップグレードをご検討ください。`,
        { max_users: maxUsers, current_count: currentCount ?? 0 },
      );
    }

    // Check if user already exists in this insurer
    // First, find auth user by email
    const { data: authData } = await admin.auth.admin.listUsers();
    const existingAuthUser = authData?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );

    let authUserId: string;

    if (existingAuthUser) {
      authUserId = existingAuthUser.id;

      // Check if already a member of this insurer
      const { data: existing } = await admin
        .from("insurer_users")
        .select("id, is_active")
        .eq("insurer_id", caller.insurerId)
        .eq("user_id", authUserId)
        .maybeSingle();

      if (existing) {
        if (existing.is_active) {
          return apiValidationError("このメールアドレスのユーザーは既に登録されています。");
        }
        // Re-activate an existing deactivated user
        const { data: reactivated, error: reactivateErr } = await admin
          .from("insurer_users")
          .update({ is_active: true, role, display_name: display_name || null })
          .eq("id", existing.id)
          .select("id, role, display_name, is_active")
          .single();

        if (reactivateErr) return apiInternalError(reactivateErr, "insurer users reactivate");
        return NextResponse.json({ ok: true, user: reactivated, reactivated: true }, { status: 200 });
      }
    } else {
      // Create a new auth user with a random password (they'll use password reset)
      const tempPassword = crypto.randomUUID();
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email: email.toLowerCase(),
        password: tempPassword,
        email_confirm: true,
      });

      if (createErr || !newUser?.user) {
        return apiInternalError(createErr ?? new Error("ユーザー作成に失敗しました"), "insurer users invite create-auth");
      }
      authUserId = newUser.user.id;
    }

    // Create insurer_users record
    const { data: newInsurerUser, error: insertErr } = await admin
      .from("insurer_users")
      .insert({
        insurer_id: caller.insurerId,
        user_id: authUserId,
        role,
        display_name: display_name || email.split("@")[0],
        is_active: true,
      })
      .select("id, role, display_name, is_active")
      .single();

    if (insertErr) {
      return apiInternalError(insertErr, "insurer users invite insert");
    }

    return NextResponse.json({ ok: true, user: newInsurerUser }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "insurer users invite");
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
