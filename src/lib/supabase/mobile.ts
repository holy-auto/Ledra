import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeRole, type Role } from "@/lib/auth/roles";

/**
 * モバイルアプリ向け Supabase クライアント
 *
 * React Native アプリからの Bearer Token 認証用。
 * Cookie ベースの server.ts とは異なり、Authorization ヘッダーから
 * JWT を取得し、PostgREST リクエストに注入する。
 */

function extractBearerToken(request: Request): string {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

/**
 * Bearer Token から Supabase クライアントを生成。
 * global.headers に Authorization を設定することで、
 * RLS が正しくユーザーコンテキストで動作する。
 */
export function createMobileClient(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in env.");
  }

  const accessToken = extractBearerToken(request);
  if (!accessToken) {
    return { client: null, accessToken: "" } as const;
  }

  const client = createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return { client, accessToken } as const;
}

export type MobileCallerInfo = {
  userId: string;
  tenantId: string;
  role: Role;
  planTier: string;
};

/**
 * モバイル版の CallerInfo 解決。
 * checkRole.ts の resolveCallerWithRole と同等だが、
 * Bearer Token を明示的に auth.getUser() に渡す。
 */
export async function resolveMobileCaller(
  client: SupabaseClient,
  accessToken: string,
): Promise<MobileCallerInfo | null> {
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

  const tenantId = mem.tenant_id as string;
  const { data: tenant } = await client.from("tenants").select("plan_tier").eq("id", tenantId).single();

  return {
    userId: userRes.user.id,
    tenantId,
    role: normalizeRole(mem.role as string),
    planTier: String((tenant as { plan_tier?: string | null })?.plan_tier ?? "free"),
  };
}
