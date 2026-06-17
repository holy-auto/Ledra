import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { parseJsonBody } from "@/lib/api/parseBody";
import { apiJson, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";
import { organizationCreateSchema, organizationUpdateSchema } from "@/lib/validations/organization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 組織管理 API。
 *
 * 組織 (multi-store group) は owner_id = auth.users.id で所有される。
 * organizations の RLS は owner_id = auth.uid() で自己所有のみに限定する
 * ため、ここでは RLS を尊重する server クライアントを用いる
 * (service-role は使わない = テナント越境の必要がない)。
 */

// ─── GET: 自分がオーナーの組織一覧 (メンバー数付き) ───
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // RLS により owner_id = auth.uid() の組織のみ取得される。
    const { data: orgs, error } = await supabase
      .from("organizations")
      .select("id, name, owner_id, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) return apiInternalError(error, "organizations GET");

    const orgList = orgs ?? [];
    const orgIds = orgList.map((o) => o.id as string);

    // メンバー数を 1 クエリで集計し、組織ごとに数え上げる。
    const memberCounts = new Map<string, number>();
    if (orgIds.length > 0) {
      const { data: members, error: mErr } = await supabase
        .from("organization_members")
        .select("organization_id")
        .in("organization_id", orgIds);
      if (mErr) return apiInternalError(mErr, "organizations GET members");
      for (const row of members ?? []) {
        const oid = row.organization_id as string;
        memberCounts.set(oid, (memberCounts.get(oid) ?? 0) + 1);
      }
    }

    return apiJson({
      organizations: orgList.map((o) => ({
        id: o.id,
        name: o.name,
        created_at: o.created_at,
        updated_at: o.updated_at,
        member_count: memberCounts.get(o.id as string) ?? 0,
      })),
    });
  } catch (e) {
    return apiInternalError(e, "organizations GET");
  }
}

// ─── POST: 組織作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 組織はグループ統括者が作るものなので owner 以上に限定する。
    if (!requireMinRole(caller, "owner")) return apiForbidden();

    const parsed = await parseJsonBody(req, organizationCreateSchema);
    if (!parsed.ok) return parsed.response;

    // owner_id は必ず caller 自身。クライアント入力は受け付けない (RLS も WITH CHECK で担保)。
    const { data: created, error } = await supabase
      .from("organizations")
      .insert({ name: parsed.data.name, owner_id: caller.userId })
      .select("id, name, created_at, updated_at")
      .single();
    if (error) return apiInternalError(error, "organizations POST");

    return apiJson({ ok: true, organization: { ...created, member_count: 0 } }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "organizations POST");
  }
}

// ─── PATCH: 組織名更新 (オーナーのみ) ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "owner")) return apiForbidden();

    const parsed = await parseJsonBody(req, organizationUpdateSchema);
    if (!parsed.ok) return parsed.response;

    // RLS (owner_id = auth.uid()) により他人の組織は 0 行更新になる。
    // 念のため owner_id でも明示フィルタして二重に防御する。
    const { data: updated, error } = await supabase
      .from("organizations")
      .update({ name: parsed.data.name })
      .eq("id", parsed.data.id)
      .eq("owner_id", caller.userId)
      .select("id, name, created_at, updated_at")
      .maybeSingle();
    if (error) return apiInternalError(error, "organizations PATCH");
    if (!updated) return apiNotFound("対象の組織が見つかりません。");

    return apiJson({ ok: true, organization: updated });
  } catch (e) {
    return apiInternalError(e, "organizations PATCH");
  }
}
