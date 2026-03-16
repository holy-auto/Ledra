import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { memberLimit, canAddMember } from "@/lib/billing/memberLimits";
import { resolveCallerFull, getAdminClient } from "@/lib/api/auth";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound, apiForbidden, apiPlanLimit } from "@/lib/api/response";
import { memberAddSchema, memberRoleChangeSchema, memberDeleteSchema } from "@/lib/validations/member";

export const dynamic = "force-dynamic";

// ─── GET: メンバー一覧 ───
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();

    const admin = getAdminClient();

    // tenant_memberships からメンバー取得
    const { data: members, error } = await admin
      .from("tenant_memberships")
      .select("user_id, role, created_at")
      .eq("tenant_id", caller.tenantId);

    if (error) return apiInternalError(error, "members list db");

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
  } catch (e) {
    return apiInternalError(e, "members list");
  }
}

// ─── POST: メンバー追加（メール招待） ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = memberAddSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が無効です。");
    }
    const { email, display_name: displayName, role } = parsed.data;

    const admin = getAdminClient();

    // 現在のメンバー数を確認
    const { count, error: countErr } = await admin
      .from("tenant_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId);

    if (countErr) return apiInternalError(countErr, "member count");

    const currentCount = count ?? 0;
    if (!canAddMember(caller.planTier, currentCount)) {
      const limit = memberLimit(caller.planTier);
      return apiPlanLimit(
        `現在のプラン（${caller.planTier}）ではメンバーは${limit}人までです。プランをアップグレードしてください。`,
        { current: currentCount, limit },
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
        const match = page_data.users.find((u) => u.email === email);
        if (match) { found = match; break; }
        if (page_data.users.length < 100) break;
        page++;
      }
      if (!found) {
        return apiInternalError(new Error("既存ユーザーが見つかりませんでした。"), "user lookup");
      }
      userId = found.id;
      // 既存ユーザーに display_name をセット（未設定の場合のみ）
      if (displayName && !found.user_metadata?.display_name) {
        await admin.auth.admin.updateUserById(userId, {
          user_metadata: { ...found.user_metadata, display_name: displayName },
        });
      }
    } else {
      return apiInternalError(new Error(inviteErr?.message ?? "招待に失敗しました。"), "invite");
    }

    // 既にこのテナントに所属していないか確認
    const { data: existingMem } = await admin
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingMem) {
      return apiValidationError("このユーザーは既にメンバーです。");
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
      return apiInternalError(insertErr, "member insert");
    }

    return apiOk({ user_id: userId, email });
  } catch (e) {
    return apiInternalError(e, "member add");
  }
}

// ─── PUT: ロール変更 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();

    // owner または admin のみロール変更可
    if (caller.role !== "owner" && caller.role !== "admin") {
      return apiForbidden("ロール変更の権限がありません。");
    }

    const body = await req.json().catch(() => ({}));
    const parsed = memberRoleChangeSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が無効です。");
    }
    const { user_id: targetUserId, role: newRole } = parsed.data;

    // 自分自身のロール変更は不可
    if (targetUserId === caller.userId) {
      return apiValidationError("自分のロールは変更できません。");
    }

    const admin = getAdminClient();

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
      return apiInternalError(error, "member role update");
    }

    return apiOk({ role: newRole });
  } catch (e) {
    return apiInternalError(e, "member role change");
  }
}

// ─── DELETE: メンバー削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();

    // owner または admin のみ削除可
    if (caller.role !== "owner" && caller.role !== "admin") {
      return apiForbidden("メンバー削除の権限がありません。");
    }

    const body = await req.json().catch(() => ({}));
    const parsed = memberDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が無効です。");
    }
    const { user_id: targetUserId } = parsed.data;

    // 自分自身は削除不可
    if (targetUserId === caller.userId) {
      return apiValidationError("自分自身は削除できません。");
    }

    const admin = getAdminClient();

    const { error } = await admin
      .from("tenant_memberships")
      .delete()
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", targetUserId);

    if (error) {
      return apiInternalError(error, "member delete");
    }

    return apiOk({});
  } catch (e) {
    return apiInternalError(e, "member delete");
  }
}
