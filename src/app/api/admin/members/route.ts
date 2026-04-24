import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { normalizePlanTier } from "@/lib/billing/planFeatures";
import { memberLimit, canAddMember } from "@/lib/billing/memberLimits";
import { logAuditEvent } from "@/lib/audit/certificateLog";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { ASSIGNABLE_ROLES, type Role } from "@/lib/auth/roles";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

/** Resolve caller and fetch plan tier for member limit checks */
async function resolveCallerWithPlan(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return null;

  const { data: tenant } = await supabase.from("tenants").select("id, plan_tier").eq("id", caller.tenantId).single();

  return {
    ...caller,
    planTier: normalizePlanTier(tenant?.plan_tier),
  };
}

// ─── GET: メンバー一覧 ───
export async function GET(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithPlan(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // tenant_memberships からメンバー取得
    const { data: members, error } = await admin
      .from("tenant_memberships")
      .select("user_id, role, created_at")
      .eq("tenant_id", caller.tenantId);

    if (error) {
      return apiInternalError(error, "members GET");
    }

    // ユーザー情報を admin API で一括取得 (N+1 回避)
    const {
      data: { users },
    } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const userMap = new Map(
      (users as Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }>).map((u) => [u.id, u]),
    );

    const enriched = (members ?? []).map((m) => {
      const user = userMap.get(m.user_id);
      const meta = user?.user_metadata as Record<string, unknown> | undefined;
      return {
        user_id: m.user_id,
        email: user?.email ?? null,
        display_name: (meta?.display_name as string | undefined) ?? null,
        role: m.role ?? "member",
        created_at: m.created_at ?? null,
        is_self: m.user_id === caller.userId,
      };
    });

    const limit = memberLimit(caller.planTier);

    return apiJson({
      members: enriched,
      plan_tier: caller.planTier,
      member_count: enriched.length,
      member_limit: limit,
      can_add: canAddMember(caller.planTier, enriched.length),
    });
  } catch (e: unknown) {
    return apiInternalError(e, "members GET");
  }
}

// ─── POST: メンバー追加（メール招待） ───
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithPlan(supabase);
    if (!caller) return apiUnauthorized();

    // Permission check: only roles with members:manage can add members
    if (!hasPermission(caller.role as Role, "members:manage")) {
      return apiForbidden("メンバー追加の権限がありません。");
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const email = (body?.email ?? "").trim().toLowerCase();
    const displayName = (body?.display_name ?? "").trim() || null;
    const role = (body?.role ?? "").trim() || null; // null → DB default

    // Validate role is assignable (prevent escalation to "owner")
    if (role && !ASSIGNABLE_ROLES.includes(role as Role)) {
      return apiValidationError(`無効なロールです。指定可能: ${ASSIGNABLE_ROLES.join(", ")}`);
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiValidationError("無効なメールアドレスです。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 現在のメンバー数を確認
    const { count, error: countErr } = await admin
      .from("tenant_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId);

    if (countErr) {
      return apiInternalError(countErr, "members POST count");
    }

    const currentCount = count ?? 0;
    if (!canAddMember(caller.planTier, currentCount)) {
      const limit = memberLimit(caller.planTier);
      return apiForbidden(
        `現在のプラン（${caller.planTier}）ではメンバーは${limit}人までです。プランをアップグレードしてください。`,
      );
    }

    const userMeta = displayName ? { display_name: displayName } : undefined;
    let userId: string;

    // まず招待を試み、既存ユーザーの場合はフォールバック
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: userMeta ?? {},
    });

    if (invited?.user) {
      userId = invited.user.id;
    } else if (inviteErr?.message?.includes("already been registered")) {
      // 既存ユーザー → auth.users からメールで検索（ページ分割で全件走査を回避）
      let found: { id: string; user_metadata?: Record<string, unknown> } | null = null;
      let page = 1;
      while (!found) {
        const { data: page_data } = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (!page_data?.users?.length) break;
        const match = page_data.users.find(
          (u: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => u.email === email,
        );
        if (match) {
          found = match;
          break;
        }
        if (page_data.users.length < 100) break;
        page++;
      }
      if (!found) {
        return apiInternalError(new Error("既存ユーザーが見つかりませんでした。"), "members POST lookup");
      }
      userId = found.id;
      // 既存ユーザーに display_name をセット（未設定の場合のみ）
      if (displayName && !found.user_metadata?.display_name) {
        await admin.auth.admin.updateUserById(userId, {
          user_metadata: { ...found.user_metadata, display_name: displayName },
        });
      }
    } else {
      return apiInternalError(inviteErr ?? new Error("招待に失敗しました。"), "members POST invite");
    }

    // 既にこのテナントに所属していないか確認
    const { data: existingMem } = await admin
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingMem) {
      return apiJson({ error: "conflict", message: "このユーザーは既にメンバーです。" }, { status: 409 });
    }

    // tenant_memberships に追加
    const row: Record<string, unknown> = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      user_id: userId,
    };
    if (role) row.role = role; // null の場合は DB デフォルトに任せる

    const { error: insertErr } = await admin.from("tenant_memberships").insert(row);

    if (insertErr) {
      return apiInternalError(insertErr, "members POST insert");
    }

    logAuditEvent({
      type: "member_added",
      tenantId: caller.tenantId,
      description: `${email} (role: ${role ?? "member"}) を追加`,
    });

    return apiJson({ ok: true, user_id: userId, email });
  } catch (e: unknown) {
    return apiInternalError(e, "members POST");
  }
}

// ─── PUT: ロール変更 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithPlan(supabase);
    if (!caller) return apiUnauthorized();

    // owner または admin のみロール変更可
    if (caller.role !== "owner" && caller.role !== "admin") {
      return apiForbidden("ロール変更の権限がありません。");
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const targetUserId = (body?.user_id ?? "").trim();
    const newRole = (body?.role ?? "").trim();

    if (!targetUserId || !newRole) {
      return apiValidationError("user_id と role は必須です。");
    }

    const validRoles = ["admin", "staff", "viewer"];
    if (!validRoles.includes(newRole)) {
      return apiValidationError("無効なロールです。");
    }

    // 自分自身のロール変更は不可
    if (targetUserId === caller.userId) {
      return apiValidationError("自分のロールは変更できません。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // owner のロール変更は不可
    const { data: targetMem } = await admin
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!targetMem) {
      return apiNotFound("メンバーが見つかりません。");
    }
    if (targetMem.role === "owner") {
      return apiValidationError("オーナーのロールは変更できません。");
    }

    const { error } = await admin
      .from("tenant_memberships")
      .update({ role: newRole })
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", targetUserId);

    if (error) {
      return apiInternalError(error, "members PUT");
    }

    logAuditEvent({
      type: "member_role_changed",
      tenantId: caller.tenantId,
      description: `${targetUserId} のロールを ${targetMem.role} → ${newRole} に変更`,
    });

    return apiJson({ ok: true, role: newRole });
  } catch (e: unknown) {
    return apiInternalError(e, "members PUT");
  }
}

// ─── DELETE: メンバー削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithPlan(supabase);
    if (!caller) return apiUnauthorized();

    // owner または admin のみ削除可
    if (caller.role !== "owner" && caller.role !== "admin") {
      return apiForbidden("メンバー削除の権限がありません。");
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const targetUserId = (body?.user_id ?? "").trim();

    if (!targetUserId) {
      return apiValidationError("user_id は必須です。");
    }

    // 自分自身は削除不可
    if (targetUserId === caller.userId) {
      return apiValidationError("自分自身は削除できません。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { error } = await admin
      .from("tenant_memberships")
      .delete()
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", targetUserId);

    if (error) {
      return apiInternalError(error, "members DELETE");
    }

    logAuditEvent({
      type: "member_removed",
      tenantId: caller.tenantId,
      description: `${targetUserId} を削除`,
    });

    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "members DELETE");
  }
}
