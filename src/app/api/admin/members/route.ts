import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { normalizePlanTier } from "@/lib/billing/planFeatures";
import { memberLimit, canAddMember } from "@/lib/billing/memberLimits";
import { logAuditEvent } from "@/lib/audit/certificateLog";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Resolve caller and fetch plan tier for member limit checks */
async function resolveCallerWithPlan(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return null;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, plan_tier")
    .eq("id", caller.tenantId)
    .single();

  return {
    ...caller,
    planTier: normalizePlanTier(tenant?.plan_tier),
  };
}

// ─── GET: メンバー一覧 ───
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithPlan(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const admin = getSupabaseAdmin();

    // tenant_memberships からメンバー取得
    const { data: members, error } = await admin
      .from("tenant_memberships")
      .select("user_id, role, created_at")
      .eq("tenant_id", caller.tenantId);

    if (error) {
      console.error("[members] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    // ユーザー情報を admin API で取得
    const enriched = await Promise.all(
      (members ?? []).map(async (m) => {
        const { data } = await admin.auth.admin.getUserById(m.user_id);
        const meta = data?.user?.user_metadata as Record<string, unknown> | undefined;
        return {
          user_id: m.user_id,
          email: data?.user?.email ?? null,
          display_name: (meta?.display_name as string | undefined) ?? null,
          role: m.role ?? "member",
          created_at: m.created_at ?? null,
          is_self: m.user_id === caller.userId,
        };
      })
    );

    const limit = memberLimit(caller.planTier);

    return NextResponse.json({
      members: enriched,
      plan_tier: caller.planTier,
      member_count: enriched.length,
      member_limit: limit,
      can_add: canAddMember(caller.planTier, enriched.length),
    });
  } catch (e: any) {
    console.error("members list failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── POST: メンバー追加（メール招待） ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithPlan(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const email = (body?.email ?? "").trim().toLowerCase();
    const displayName = (body?.display_name ?? "").trim() || null;
    const role = (body?.role ?? "").trim() || null; // null → DB default

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // 現在のメンバー数を確認
    const { count, error: countErr } = await admin
      .from("tenant_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId);

    if (countErr) {
      console.error("[members] db_error:", countErr.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    const currentCount = count ?? 0;
    if (!canAddMember(caller.planTier, currentCount)) {
      const limit = memberLimit(caller.planTier);
      return NextResponse.json({
        error: "member_limit_reached",
        message: `現在のプラン（${caller.planTier}）ではメンバーは${limit}人までです。プランをアップグレードしてください。`,
        current: currentCount,
        limit,
      }, { status: 403 });
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
        const match = page_data.users.find((u) => u.email === email);
        if (match) { found = match; break; }
        if (page_data.users.length < 100) break;
        page++;
      }
      if (!found) {
        return NextResponse.json({ error: "user_lookup_failed", message: "既存ユーザーが見つかりませんでした。" }, { status: 500 });
      }
      userId = found.id;
      // 既存ユーザーに display_name をセット（未設定の場合のみ）
      if (displayName && !found.user_metadata?.display_name) {
        await admin.auth.admin.updateUserById(userId, {
          user_metadata: { ...found.user_metadata, display_name: displayName },
        });
      }
    } else {
      return NextResponse.json({ error: "invite_failed", message: inviteErr?.message ?? "招待に失敗しました。" }, { status: 500 });
    }

    // 既にこのテナントに所属していないか確認
    const { data: existingMem } = await admin
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingMem) {
      return NextResponse.json({ error: "already_member", message: "このユーザーは既にメンバーです。" }, { status: 409 });
    }

    // tenant_memberships に追加
    const row: Record<string, unknown> = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      user_id: userId,
    };
    if (role) row.role = role; // null の場合は DB デフォルトに任せる

    const { error: insertErr } = await admin
      .from("tenant_memberships")
      .insert(row);

    if (insertErr) {
      console.error("member insert failed:", insertErr);
      return NextResponse.json({
        error: "insert_failed",
        message: "メンバー追加に失敗しました。",
      }, { status: 500 });
    }

    logAuditEvent({
      type: "member_added",
      tenantId: caller.tenantId,
      description: `${email} (role: ${role ?? "member"}) を追加`,
    });

    return NextResponse.json({ ok: true, user_id: userId, email });
  } catch (e: any) {
    console.error("member add failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── PUT: ロール変更 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithPlan(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // owner または admin のみロール変更可
    if (caller.role !== "owner" && caller.role !== "admin") {
      return NextResponse.json({ error: "forbidden", message: "ロール変更の権限がありません。" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({} as any));
    const targetUserId = (body?.user_id ?? "").trim();
    const newRole = (body?.role ?? "").trim();

    if (!targetUserId || !newRole) {
      return NextResponse.json({ error: "missing_params", message: "user_id と role は必須です。" }, { status: 400 });
    }

    const validRoles = ["admin", "staff", "viewer"];
    if (!validRoles.includes(newRole)) {
      return NextResponse.json({ error: "invalid_role", message: "無効なロールです。" }, { status: 400 });
    }

    // 自分自身のロール変更は不可
    if (targetUserId === caller.userId) {
      return NextResponse.json({ error: "cannot_change_self", message: "自分のロールは変更できません。" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // owner のロール変更は不可
    const { data: targetMem } = await admin
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!targetMem) {
      return NextResponse.json({ error: "not_found", message: "メンバーが見つかりません。" }, { status: 404 });
    }
    if (targetMem.role === "owner") {
      return NextResponse.json({ error: "cannot_change_owner", message: "オーナーのロールは変更できません。" }, { status: 400 });
    }

    const { error } = await admin
      .from("tenant_memberships")
      .update({ role: newRole })
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", targetUserId);

    if (error) {
      console.error("[members] update_failed:", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    logAuditEvent({
      type: "member_role_changed",
      tenantId: caller.tenantId,
      description: `${targetUserId} のロールを ${targetMem.role} → ${newRole} に変更`,
    });

    return NextResponse.json({ ok: true, role: newRole });
  } catch (e: any) {
    console.error("member role change failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── DELETE: メンバー削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithPlan(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // owner または admin のみ削除可
    if (caller.role !== "owner" && caller.role !== "admin") {
      return NextResponse.json({ error: "forbidden", message: "メンバー削除の権限がありません。" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({} as any));
    const targetUserId = (body?.user_id ?? "").trim();

    if (!targetUserId) {
      return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
    }

    // 自分自身は削除不可
    if (targetUserId === caller.userId) {
      return NextResponse.json({ error: "cannot_remove_self", message: "自分自身は削除できません。" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const { error } = await admin
      .from("tenant_memberships")
      .delete()
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", targetUserId);

    if (error) {
      console.error("[members] delete_failed:", error.message);
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }

    logAuditEvent({
      type: "member_removed",
      tenantId: caller.tenantId,
      description: `${targetUserId} を削除`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("member delete failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
