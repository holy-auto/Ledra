import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizePlanTier } from "@/lib/billing/planFeatures";
import { memberLimit, canAddMember } from "@/lib/billing/memberLimits";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** 現在ログインユーザーの tenant_id + plan_tier を取得 */
async function resolveCallerTenant(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return null;

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, role")
    .eq("user_id", userRes.user.id)
    .limit(1)
    .single();

  if (!mem?.tenant_id) return null;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, plan_tier")
    .eq("id", mem.tenant_id)
    .single();

  return {
    userId: userRes.user.id,
    tenantId: mem.tenant_id as string,
    role: (mem.role as string) ?? "member",
    planTier: normalizePlanTier(tenant?.plan_tier),
  };
}

// ─── GET: メンバー一覧 ───
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const admin = getSupabaseAdmin();

    // tenant_memberships からメンバー取得
    const { data: members, error } = await admin
      .from("tenant_memberships")
      .select("user_id, role, created_at")
      .eq("tenant_id", caller.tenantId);

    if (error) return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });

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
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

// ─── POST: メンバー追加（メール招待） ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
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

    if (countErr) return NextResponse.json({ error: "db_error", detail: countErr.message }, { status: 500 });

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

    // 既存ユーザーを検索、なければ招待作成
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    let userId: string;

    const userMeta = displayName ? { display_name: displayName } : undefined;

    if (existingUser) {
      userId = existingUser.id;
      // 既存ユーザーに display_name をセット（未設定の場合のみ）
      if (displayName && !existingUser.user_metadata?.display_name) {
        await admin.auth.admin.updateUserById(userId, {
          user_metadata: { ...existingUser.user_metadata, display_name: displayName },
        });
      }
    } else {
      // Supabase Auth に招待ユーザーを作成
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: userMeta ?? {},
      });
      if (inviteErr || !invited?.user) {
        return NextResponse.json({ error: "invite_failed", detail: inviteErr?.message ?? "unknown" }, { status: 500 });
      }
      userId = invited.user.id;
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
        message: `メンバー追加に失敗しました: ${insertErr.message}`,
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true, user_id: userId, email });
  } catch (e: any) {
    console.error("member add failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

// ─── DELETE: メンバー削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
      return NextResponse.json({ error: "delete_failed", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("member delete failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
