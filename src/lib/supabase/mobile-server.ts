import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

/**
 * Create a Supabase client from a Bearer token (for mobile API routes).
 * Unlike the SSR client, this does not use cookies.
 */
export function createMobileClient(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createSupabaseClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
