import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { parseJsonBody } from "@/lib/api/parseBody";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { organizationMemberAddSchema } from "@/lib/validations/organization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 組織メンバー (所属テナント) 管理 API。
 *
 * 横断的にメンバー店舗の tenants 情報を読む必要があるため、組織オーナー
 * 検証を server (RLS) クライアントで行ったうえで、tenants / members の
 * 読み書きは createPlatformScopedAdmin (RLS bypass) で実施する。オーナーが
 * 自分の組織を跨いで店舗を束ねるのは正当なクロステナント操作。
 */

/**
 * caller が当該組織のオーナーか検証する。
 * RLS により owner 以外には組織行が見えないため、存在 = 所有とみなせる。
 * @returns true = オーナー / false = 非オーナー or 組織なし
 */
async function assertOwner(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", orgId)
    .eq("owner_id", userId)
    .maybeSingle();
  return !!data;
}

// ─── GET: メンバー店舗一覧 (tenants を join) ───
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id: orgId } = await params;
    if (!(await assertOwner(supabase, orgId, caller.userId))) {
      return apiNotFound("対象の組織が見つかりません。");
    }

    const admin = createPlatformScopedAdmin("組織オーナーによる所属店舗一覧の参照 (クロステナント)");

    const { data: members, error } = await admin
      .from("organization_members")
      .select("id, tenant_id, role, joined_at, tenant:tenants ( id, name, plan_tier )")
      .eq("organization_id", orgId)
      .order("joined_at", { ascending: true });
    if (error) return apiInternalError(error, "org members GET");

    const list = (members ?? []).map((m) => {
      const tenant = (m as { tenant?: { id?: string; name?: string; plan_tier?: string } | null }).tenant ?? null;
      return {
        id: m.id,
        tenant_id: m.tenant_id,
        role: m.role,
        joined_at: m.joined_at,
        tenant_name: tenant?.name ?? null,
        plan_tier: tenant?.plan_tier ?? null,
      };
    });

    return apiJson({ members: list });
  } catch (e) {
    return apiInternalError(e, "org members GET");
  }
}

// ─── POST: 店舗を組織に追加 ───
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "owner")) return apiForbidden();

    const { id: orgId } = await params;
    if (!(await assertOwner(supabase, orgId, caller.userId))) {
      return apiNotFound("対象の組織が見つかりません。");
    }

    const parsed = await parseJsonBody(req, organizationMemberAddSchema);
    if (!parsed.ok) return parsed.response;
    const { tenant_id } = parsed.data;

    const admin = createPlatformScopedAdmin("組織オーナーによる所属店舗の追加 (クロステナント)");

    // 追加対象テナントの存在検証。
    const { data: tenant, error: tErr } = await admin
      .from("tenants")
      .select("id, name, plan_tier")
      .eq("id", tenant_id)
      .maybeSingle();
    if (tErr) return apiInternalError(tErr, "org members POST tenant");
    if (!tenant) return apiValidationError("指定された店舗が見つかりません。");

    // 既に所属していないか確認 (unique 制約もあるが分かりやすいエラーを返す)。
    const { data: existing } = await admin
      .from("organization_members")
      .select("id")
      .eq("organization_id", orgId)
      .eq("tenant_id", tenant_id)
      .maybeSingle();
    if (existing) return apiValidationError("この店舗は既に組織に追加されています。");

    const { data: inserted, error } = await admin
      .from("organization_members")
      .insert({ organization_id: orgId, tenant_id, role: "member" })
      .select("id, tenant_id, role, joined_at")
      .single();
    if (error) return apiInternalError(error, "org members POST");

    return apiJson(
      {
        ok: true,
        member: {
          id: inserted.id,
          tenant_id: inserted.tenant_id,
          role: inserted.role,
          joined_at: inserted.joined_at,
          tenant_name: tenant.name ?? null,
          plan_tier: tenant.plan_tier ?? null,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    return apiInternalError(e, "org members POST");
  }
}

// ─── DELETE: 店舗を組織から除外 (?tenant_id=uuid) ───
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "owner")) return apiForbidden();

    const { id: orgId } = await params;
    if (!(await assertOwner(supabase, orgId, caller.userId))) {
      return apiNotFound("対象の組織が見つかりません。");
    }

    const tenantId = new URL(req.url).searchParams.get("tenant_id");
    if (!tenantId) return apiValidationError("tenant_id を指定してください。");

    const admin = createPlatformScopedAdmin("組織オーナーによる所属店舗の除外 (クロステナント)");

    const { data: deleted, error } = await admin
      .from("organization_members")
      .delete()
      .eq("organization_id", orgId)
      .eq("tenant_id", tenantId)
      .select("id")
      .maybeSingle();
    if (error) return apiInternalError(error, "org members DELETE");
    if (!deleted) return apiNotFound("対象の店舗は組織に含まれていません。");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "org members DELETE");
  }
}
