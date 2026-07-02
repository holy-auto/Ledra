import type { SupabaseClient } from "@supabase/supabase-js";
import { createMobileClient } from "@/lib/supabase/mobile-server";
import { normalizeRole, type Role } from "./roles";

export type MobileCaller = {
  userId: string;
  tenantId: string;
  role: Role;
  supabase: SupabaseClient;
};

/**
 * モバイル版の CallerInfo 解決（Bearer Token 認証）。
 * checkRole.ts の resolveCallerWithRole と同等だが、セッションを持たないため
 * Bearer Token を明示的に auth.getUser() に渡して検証する。
 * 未認証またはテナント非所属なら null を返す。
 */
export async function resolveMobileCaller(request: Request): Promise<MobileCaller | null> {
  const { client, accessToken } = createMobileClient(request);
  if (!client) return null;

  // JWT を検証してユーザー情報を取得
  const { data: userRes, error: authError } = await client.auth.getUser(accessToken);
  if (authError || !userRes?.user) return null;

  // テナントメンバーシップを取得（RLS は global header の JWT で動作）
  const { data: mem } = await client
    .from("tenant_memberships")
    .select("tenant_id, role")
    .eq("user_id", userRes.user.id)
    .limit(1)
    .single();

  if (!mem?.tenant_id) return null;

  return {
    userId: userRes.user.id,
    tenantId: mem.tenant_id as string,
    role: normalizeRole(mem.role),
    supabase: client,
  };
}
