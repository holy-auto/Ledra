import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { resolveUserId } from "@/lib/auth/checkRole";
import { resolveOrgAccess } from "@/lib/auth/orgAccess";
import { parseJsonBody } from "@/lib/api/parseBody";
import { ORG_ROLE_LABELS, normalizeOrgRole } from "@/lib/auth/orgRoles";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { organizationUserAddSchema, organizationUserRoleSchema } from "@/lib/validations/organization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 本社チーム (organization_users) 管理 API。
 *
 * - GET    : 本社チーム一覧。owner / 本社メンバーが閲覧可。
 * - POST   : メール招待で本社チームに追加。owner のみ。
 * - PUT    : ロール変更。owner のみ。
 * - DELETE : 除外 (?user_id=uuid)。owner のみ。
 *
 * organization_users の RLS は owner のみ書込可 (org_users_insert/update/delete)。
 * email→user_id 解決と一覧の付帯情報取得のため、owner 検証後に
 * createPlatformScopedAdmin (RLS bypass) を用いる。
 */

// ─── GET: 本社チーム一覧 ───
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await resolveUserId(supabase);
    if (!userId) return apiUnauthorized();

    const { id: orgId } = await params;
    const access = await resolveOrgAccess(supabase, orgId, userId);
    if (!access) return apiNotFound("対象の組織が見つかりません。");

    const admin = createPlatformScopedAdmin("本社チーム一覧の参照 (email 付帯情報取得)");

    const { data: rows, error } = await admin
      .from("organization_users")
      .select("user_id, role, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true });
    if (error) return apiInternalError(error, "org users GET");

    // email / display_name を auth admin で一括解決 (N+1 回避)。
    const {
      data: { users },
    } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const userMap = new Map(
      (users as Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }>).map((u) => [u.id, u]),
    );

    const list = (rows ?? []).map((r) => {
      const user = userMap.get(r.user_id as string);
      const meta = user?.user_metadata as Record<string, unknown> | undefined;
      const role = normalizeOrgRole(r.role);
      return {
        user_id: r.user_id,
        email: user?.email ?? null,
        display_name: (meta?.display_name as string | undefined) ?? null,
        role,
        role_label: ORG_ROLE_LABELS[role],
        created_at: r.created_at,
        is_self: r.user_id === userId,
      };
    });

    return apiJson({ users: list, can_manage: access.canManage });
  } catch (e) {
    return apiInternalError(e, "org users GET");
  }
}

// ─── POST: 本社チームにメール招待で追加 (owner のみ) ───
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const callerUserId = await resolveUserId(supabase);
    if (!callerUserId) return apiUnauthorized();

    const { id: orgId } = await params;
    const access = await resolveOrgAccess(supabase, orgId, callerUserId);
    if (!access) return apiNotFound("対象の組織が見つかりません。");
    if (!access.canManage) return apiForbidden("本社チームを管理する権限がありません。");

    const parsed = await parseJsonBody(req, organizationUserAddSchema);
    if (!parsed.ok) return parsed.response;
    const { email, role } = parsed.data;

    const admin = createPlatformScopedAdmin("本社チーム追加 — email 招待 + organization_users 登録");

    // 既存ユーザーは招待がエラーになるためフォールバックで検索 (members route と同方式)。
    let userId: string;
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email);
    if (invited?.user) {
      userId = invited.user.id;
    } else if (inviteErr?.message?.includes("already been registered")) {
      let found: { id: string; email?: string } | null = null;
      let page = 1;
      while (!found) {
        const { data: pageData } = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (!pageData?.users?.length) break;
        const match = pageData.users.find((u: { id: string; email?: string }) => u.email === email);
        if (match) found = match;
        if (pageData.users.length < 100) break;
        page++;
      }
      if (!found) return apiInternalError(new Error("既存ユーザーが見つかりませんでした。"), "org users POST lookup");
      userId = found.id;
    } else {
      return apiInternalError(inviteErr ?? new Error("招待に失敗しました。"), "org users POST invite");
    }

    // 既に本社チームに居ないか確認 (unique 制約もあるが分かりやすいエラーを返す)。
    const { data: existing } = await admin
      .from("organization_users")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) return apiValidationError("このユーザーは既に本社チームに追加されています。");

    const { error: insErr } = await admin
      .from("organization_users")
      .insert({ organization_id: orgId, user_id: userId, role });
    if (insErr) return apiInternalError(insErr, "org users POST insert");

    return apiJson({ ok: true, user_id: userId, email, role }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "org users POST");
  }
}

// ─── PUT: ロール変更 (owner のみ) ───
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await resolveUserId(supabase);
    if (!userId) return apiUnauthorized();

    const { id: orgId } = await params;
    const access = await resolveOrgAccess(supabase, orgId, userId);
    if (!access) return apiNotFound("対象の組織が見つかりません。");
    if (!access.canManage) return apiForbidden("本社チームを管理する権限がありません。");

    const parsed = await parseJsonBody(req, organizationUserRoleSchema);
    if (!parsed.ok) return parsed.response;
    const { user_id: targetUserId, role } = parsed.data;

    const admin = createPlatformScopedAdmin("本社チームのロール変更");

    const { data: updated, error } = await admin
      .from("organization_users")
      .update({ role })
      .eq("organization_id", orgId)
      .eq("user_id", targetUserId)
      .select("user_id, role")
      .maybeSingle();
    if (error) return apiInternalError(error, "org users PUT");
    if (!updated) return apiNotFound("対象のメンバーが本社チームに見つかりません。");

    return apiJson({ ok: true, user_id: updated.user_id, role: updated.role });
  } catch (e) {
    return apiInternalError(e, "org users PUT");
  }
}

// ─── DELETE: 本社チームから除外 (?user_id=uuid, owner のみ) ───
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await resolveUserId(supabase);
    if (!userId) return apiUnauthorized();

    const { id: orgId } = await params;
    const access = await resolveOrgAccess(supabase, orgId, userId);
    if (!access) return apiNotFound("対象の組織が見つかりません。");
    if (!access.canManage) return apiForbidden("本社チームを管理する権限がありません。");

    const targetUserId = new URL(req.url).searchParams.get("user_id");
    if (!targetUserId) return apiValidationError("user_id を指定してください。");

    const admin = createPlatformScopedAdmin("本社チームから除外");

    const { data: deleted, error } = await admin
      .from("organization_users")
      .delete()
      .eq("organization_id", orgId)
      .eq("user_id", targetUserId)
      .select("user_id")
      .maybeSingle();
    if (error) return apiInternalError(error, "org users DELETE");
    if (!deleted) return apiNotFound("対象のメンバーは本社チームに含まれていません。");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "org users DELETE");
  }
}
