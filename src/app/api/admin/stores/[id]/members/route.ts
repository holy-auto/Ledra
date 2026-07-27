import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { storeMemberAddSchema, storeMemberDeleteSchema } from "@/lib/validations/store";

export const dynamic = "force-dynamic";

/** 指定店舗が当該テナントに属するか確認する。 */
async function storeInTenant(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  storeId: string,
  tenantId: string,
): Promise<boolean> {
  const { data } = await supabase.from("stores").select("id").eq("id", storeId).eq("tenant_id", tenantId).maybeSingle();
  return !!data;
}

// GET /api/admin/stores/:id/members — 店舗担当者一覧（表示名・メール付き）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "stores:view")) return apiForbidden();

    const { id: storeId } = await params;
    if (!(await storeInTenant(supabase, storeId, caller.tenantId))) return apiNotFound("店舗が見つかりません。");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: memberships, error } = await admin
      .from("store_memberships")
      .select("user_id, role, created_at")
      .eq("store_id", storeId)
      .eq("tenant_id", caller.tenantId);
    if (error) return apiInternalError(error, "store members GET");

    const {
      data: { users },
    } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const userMap = new Map(
      (users as Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }>).map((u) => [u.id, u]),
    );

    const members = (memberships ?? []).map((m) => {
      const user = userMap.get(m.user_id);
      const meta = user?.user_metadata as Record<string, unknown> | undefined;
      return {
        user_id: m.user_id,
        role: m.role,
        email: user?.email ?? null,
        display_name: (meta?.display_name as string | undefined) ?? null,
        created_at: m.created_at ?? null,
      };
    });

    return apiJson({ members });
  } catch (e) {
    return apiInternalError(e, "store members GET");
  }
}

// POST /api/admin/stores/:id/members — 担当者を割当（役割変更は同じ user_id で再送信）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "stores:manage")) return apiForbidden();

    const { id: storeId } = await params;
    if (!(await storeInTenant(supabase, storeId, caller.tenantId))) return apiNotFound("店舗が見つかりません。");

    const parsed = storeMemberAddSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { user_id: userId, role } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 割当先が当該テナントのメンバーか確認（他テナントアカウントの割当防止）
    const { data: membership } = await admin
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) return apiValidationError("このユーザーはテナントのメンバーではありません。");

    const { error } = await admin
      .from("store_memberships")
      .upsert(
        { store_id: storeId, tenant_id: caller.tenantId, user_id: userId, role },
        { onConflict: "store_id,user_id" },
      );
    if (error) return apiInternalError(error, "store members POST");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "store members POST");
  }
}

// DELETE /api/admin/stores/:id/members — 担当者の割当解除
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "stores:manage")) return apiForbidden();

    const { id: storeId } = await params;
    if (!(await storeInTenant(supabase, storeId, caller.tenantId))) return apiNotFound("店舗が見つかりません。");

    const parsed = storeMemberDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { error } = await admin
      .from("store_memberships")
      .delete()
      .eq("store_id", storeId)
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", parsed.data.user_id);
    if (error) return apiInternalError(error, "store members DELETE");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "store members DELETE");
  }
}
