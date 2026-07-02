import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * モバイルアプリ向け Supabase クライアント（Bearer Token 認証）。
 * Cookie ベースの server.ts とは異なり、Authorization ヘッダーから JWT を取得し、
 * global.headers に注入することで RLS がユーザーコンテキストで動作する。
 * accessToken は auth.getUser(token) での明示検証用に併せて返す。
 */
export function createMobileClient(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!accessToken) {
    return { client: null, accessToken: "" } as const;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in env.");
  }

  const client = createSupabaseClient(url, anonKey, {
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
