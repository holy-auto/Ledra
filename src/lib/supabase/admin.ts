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
 * Returns the admin client together with the tenantId that the caller
 * **MUST** use to filter every query.
 *
 * @security **CRITICAL** — The returned `admin` client bypasses RLS and has
 * unrestricted access to ALL tenants. Every query built with this client
 * **MUST** include `.eq("tenant_id", tenantId)` (or an equivalent filter).
 * Failing to do so will cause **cross-tenant data leakage**.
 *
 * @example
 * ```ts
 * const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
 * const { data } = await admin
 *   .from("some_table")
 *   .select("*")
 *   .eq("tenant_id", tenantId); // <-- REQUIRED
 * ```
 *
 * @throws {Error} if tenantId is falsy (empty string, null, undefined)
 */
export function createTenantScopedAdmin(tenantId: string) {
  if (!tenantId || typeof tenantId !== "string" || tenantId.trim() === "") {
    throw new Error(
      "[security] createTenantScopedAdmin called with falsy or empty tenantId. " +
        "This is a critical error — aborting to prevent cross-tenant data leakage.",
    );
  }
  return { admin: getSupabaseAdmin(), tenantId };
}

/**
 * Platform-admin escape hatch for legitimate service-role uses that
 * genuinely span every tenant (cron jobs, webhooks, public token lookups,
 * pre-authentication flows).
 *
 * The `reason` string is a **mandatory breadcrumb**: it shows up in the
 * call site and in ESLint grep results so that reviewers can confirm why
 * the un-scoped client is justified. The string itself is not validated
 * at runtime beyond non-emptiness.
 *
 * @security **CRITICAL** — This client bypasses RLS across every tenant.
 * Use `createTenantScopedAdmin(tenantId)` / `createInsurerScopedAdmin(insurerId)`
 * whenever a scope identifier is available. Only reach for this helper
 * when the work is truly platform-wide.
 *
 * @example
 * ```ts
 * const admin = createServiceRoleAdmin("cron:billing sweeps every tenant");
 * ```
 *
 * @throws {Error} if reason is falsy or empty
 */
export function createServiceRoleAdmin(reason: string): AnySupabaseClient {
  if (!reason || typeof reason !== "string" || reason.trim() === "") {
    throw new Error(
      "[security] createServiceRoleAdmin requires a non-empty reason string. " +
        "Document why platform-wide access is legitimate here.",
    );
  }
  return getSupabaseAdmin();
}

/**
 * Insurer-scoped admin client wrapper.
 *
 * Use for insurer-facing routes (`/api/insurer/*`) where authorization is
 * bounded by `insurer_id` rather than `tenant_id`. Every query built from
 * `admin` **MUST** include `.eq("insurer_id", insurerId)` (or equivalent).
 *
 * @security **CRITICAL** — Same contract as `createTenantScopedAdmin`:
 * the returned client bypasses RLS. Cross-insurer data leakage is the
 * failure mode this wrapper exists to discourage.
 *
 * @example
 * ```ts
 * const { admin, insurerId } = createInsurerScopedAdmin(caller.insurerId);
 * const { data } = await admin
 *   .from("insurer_cases")
 *   .select("*")
 *   .eq("id", caseId)
 *   .eq("insurer_id", insurerId); // <-- REQUIRED
 * ```
 *
 * @throws {Error} if insurerId is falsy (empty string, null, undefined)
 */
export function createInsurerScopedAdmin(insurerId: string) {
  if (!insurerId || typeof insurerId !== "string" || insurerId.trim() === "") {
    throw new Error(
      "[security] createInsurerScopedAdmin called with falsy or empty insurerId. " +
        "This is a critical error — aborting to prevent cross-insurer data leakage.",
    );
  }
  return { admin: getSupabaseAdmin(), insurerId };
}
