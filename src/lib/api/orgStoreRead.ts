import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { resolveUserId } from "@/lib/auth/checkRole";
import { resolveOrgAccess } from "@/lib/auth/orgAccess";
import { apiUnauthorized, apiNotFound } from "@/lib/api/response";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, any, any>;

/**
 * 本社横断リード API の共通認可。
 *
 * 1) 認証 (resolveCallerWithRole)
 * 2) 組織アクセス権 (owner / 本社メンバーのいずれか) — 閲覧は横断で許可
 * 3) 対象店舗 (tenantId) が当該組織に所属しているか検証
 *
 * 成功時は RLS バイパスの admin と tenantId を返す。各クエリは必ず
 * `.eq("tenant_id", tenantId)` でスコープすること (クロステナント漏洩防止)。
 * 書込は提供しない (本社は閲覧のみ。書込は店舗単位の membership が必要)。
 */
export async function authorizeOrgStoreRead(
  orgId: string,
  tenantId: string,
): Promise<{ ok: true; admin: AdminDb; tenantId: string } | { ok: false; response: Response }> {
  const supabase = await createSupabaseServerClient();
  const userId = await resolveUserId(supabase);
  if (!userId) return { ok: false, response: apiUnauthorized() };

  const access = await resolveOrgAccess(supabase, orgId, userId);
  if (!access) return { ok: false, response: apiNotFound("対象の組織が見つかりません。") };

  const admin = createPlatformScopedAdmin("本社による所属店舗データの横断閲覧 (read-only クロステナント)");

  // 対象店舗が組織に属するか検証 (属さない tenantId への横断参照を遮断)。
  const { data: member } = await admin
    .from("organization_members")
    .select("tenant_id")
    .eq("organization_id", orgId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!member) return { ok: false, response: apiNotFound("対象の店舗は組織に含まれていません。") };

  return { ok: true, admin, tenantId };
}

/** ?limit / ?offset を安全にパース (limit: 1..200 既定50, offset: >=0)。 */
export function parsePaging(req: Request): { limit: number; offset: number } {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");
  // 未指定 (null) / 空文字は既定値。Number(null) や Number("") は 0 になるため明示判定する。
  const rawLimit = limitParam ? Number(limitParam) : NaN;
  const rawOffset = offsetParam ? Number(offsetParam) : NaN;
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 50;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0;
  return { limit, offset };
}
