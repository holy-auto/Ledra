import { createClient } from "@supabase/supabase-js";
import { tls13Fetch } from "@/lib/net/tls13Fetch";

/**
 * Cookie-free Supabase client for public, unauthenticated queries
 * (e.g. listing published posts at build time in generateStaticParams).
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in env.");
  }

  return createClient(url, anonKey, { global: { fetch: tls13Fetch } }); // TLS 1.3+ (C2PA GPSA O.5)
}
