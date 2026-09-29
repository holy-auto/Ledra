/**
 * Read-replica aware Supabase client.
 *
 * Supabase Pro projects can have one or more read replicas in additional
 * regions. The replicas expose the same Postgres schema (eventually
 * consistent — typically <1s lag) and accept the *same* service-role key
 * as the primary. They're a free win for:
 *
 *   - Anonymous public pages (e.g. `/v/[vin]`, `/c/[public_id]`) where
 *     freshness of <1s lag is fine and the request rate is unpredictable
 *   - Dashboard summary queries that scan large tables (the primary should
 *     keep its capacity for writes from POS / certificate issuance)
 *   - Cron jobs that compute aggregates / reports
 *
 * Operational notes:
 *   - The replica is **read-only**. Any write attempt will throw at the
 *     PG layer. Helpers here therefore typed-narrow to remove `insert` /
 *     `update` / `delete` / `rpc` from the returned shape — this is
 *     intentional, the runtime error would be late and confusing.
 *   - When `SUPABASE_REPLICA_URL` is unset (most local / staging envs),
 *     `getReadReplica()` returns the primary admin client. Callers do
 *     NOT need to branch — it's a transparent fallback so we can ship
 *     replica-aware code well before Pro replicas are provisioned.
 *
 * Env:
 *   SUPABASE_REPLICA_URL = the replica endpoint
 *                          (e.g. https://<id>-replica.supabase.co)
 *                          falls back to NEXT_PUBLIC_SUPABASE_URL when unset.
 *   SUPABASE_SERVICE_ROLE_KEY is reused as the auth key (same role on replica).
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { tls13Fetch } from "@/lib/net/tls13Fetch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

let replicaClient: AnySupabaseClient | null = null;

/** True iff a distinct replica endpoint is configured. Used by /api/health. */
export function isReadReplicaConfigured(): boolean {
  const replicaUrl = (process.env.SUPABASE_REPLICA_URL ?? "").trim();
  const primaryUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  return replicaUrl.length > 0 && replicaUrl !== primaryUrl;
}

/**
 * Returns a read-only Supabase client pointing at the replica when
 * configured, else falls back to the primary admin client.
 *
 * The returned client is a *full* SupabaseClient at the type level for
 * compatibility with existing query-builder chains. Callers SHOULD only
 * use `.from(...).select(...)`. Writes go via the primary
 * `createServiceRoleAdmin()` / `createTenantScopedAdmin()`.
 *
 * @param reason — breadcrumb for grep/audit, mirrors `createServiceRoleAdmin`.
 */
export function getReadReplica(reason: string): AnySupabaseClient {
  if (!reason || typeof reason !== "string" || reason.trim() === "") {
    throw new Error("[supabase] getReadReplica requires a non-empty reason string for audit trail.");
  }

  if (!isReadReplicaConfigured()) {
    return createServiceRoleAdmin(`replica-fallback: ${reason}`);
  }

  if (!replicaClient) {
    const url = process.env.SUPABASE_REPLICA_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
      throw new Error("SUPABASE_REPLICA_URL set but SUPABASE_SERVICE_ROLE_KEY is missing");
    }
    replicaClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: tls13Fetch }, // Backend → Supabase is TLS 1.3+ (C2PA GPSA O.5)
      // Replica is read-only; disable realtime which would attempt writes
      // on the auth schema during heartbeat reconciliation.
      realtime: { params: { eventsPerSecond: 0 } },
    });
  }
  return replicaClient;
}

/** Reset the cached replica client (for tests only). */
export function __resetReplicaClientForTest(): void {
  replicaClient = null;
}
