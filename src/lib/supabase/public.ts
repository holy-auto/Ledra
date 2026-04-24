import { createClient } from "@supabase/supabase-js";

/**
 * Cookie-free Supabase client for public, unauthenticated queries
 * (e.g. listing published posts at build time in generateStaticParams).
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in env.",
    );
  }

  return createClient(url, anonKey);
}
