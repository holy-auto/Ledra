import { createClient, SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

let adminClient: AnySupabaseClient | null = null;

/**
 * Returns a lazily-initialized singleton Supabase admin client
 * using the service role key (bypasses RLS).
 *
 * Prefer this over creating ad-hoc clients in individual files.
 */
export function getSupabaseAdmin(): AnySupabaseClient {
  if (!adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

// Backward-compatible aliases used by existing code paths
export const createAdminClient = getSupabaseAdmin;
export const supabaseAdmin = /* @__PURE__ */ new Proxy({} as AnySupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabaseAdmin(), prop, receiver);
  },
});

/**
 * Tenant-scoped admin client wrapper.
 *
 * Returns the admin client with a helper that automatically appends
 * `.eq("tenant_id", tenantId)` to queries, reducing the risk of
 * cross-tenant data leakage when using the service-role client.
 *
 * Usage:
 *   const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
 *   // Use admin normally — but remember to add tenant filtering
 */
export function createTenantScopedAdmin(tenantId: string) {
  if (!tenantId) {
    throw new Error("[security] createTenantScopedAdmin called without tenantId");
  }
  return { admin: getSupabaseAdmin(), tenantId };
}
