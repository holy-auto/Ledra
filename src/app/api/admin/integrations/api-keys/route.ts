/**
 * GET  /api/admin/integrations/api-keys  — list keys (raw key never returned)
 * POST /api/admin/integrations/api-keys  — create a new key. The plaintext
 *                                         `lk_live_…` value is returned ONCE
 *                                         in this response and is unrecoverable
 *                                         afterwards (Stripe pattern).
 */

import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { generateApiKey } from "@/lib/tenant-api-keys";
import { API_KEY_SCOPES } from "@/lib/api-key-scopes";

export const dynamic = "force-dynamic";

const KNOWN_SCOPES = API_KEY_SCOPES;

const createSchema = z.object({
  description: z.string().max(200).optional(),
  scopes: z.array(z.enum(KNOWN_SCOPES)).min(1).max(KNOWN_SCOPES.length),
  expires_at: z
    .string()
    .datetime()
    .optional()
    .refine((v) => !v || new Date(v).getTime() > Date.now(), { message: "expires_at_in_past" }),
});

interface KeyRow {
  id: string;
  prefix: string;
  description: string | null;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function shape(row: KeyRow) {
  return {
    id: row.id,
    prefix: row.prefix,
    description: row.description,
    scopes: row.scopes,
    expires_at: row.expires_at,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
    status: row.revoked_at
      ? "revoked"
      : row.expires_at && new Date(row.expires_at).getTime() < Date.now()
        ? "expired"
        : "active",
  };
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "settings:view")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("tenant_api_keys")
      .select("id, prefix, description, scopes, expires_at, last_used_at, revoked_at, created_at")
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (error) return apiInternalError(error, "integrations/api-keys GET");
    return apiOk({ keys: ((data ?? []) as KeyRow[]).map(shape) });
  } catch (e) {
    return apiInternalError(e, "integrations/api-keys GET");
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "settings:edit")) return apiForbidden();

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    let generated: ReturnType<typeof generateApiKey>;
    try {
      generated = generateApiKey();
    } catch (e) {
      // Pepper missing → server config issue, not a client error.
      return apiInternalError(e, "integrations/api-keys POST: generate");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("tenant_api_keys")
      .insert({
        tenant_id: caller.tenantId,
        prefix: generated.prefix,
        key_hash: generated.keyHash,
        description: parsed.data.description ?? null,
        scopes: parsed.data.scopes,
        expires_at: parsed.data.expires_at ?? null,
        created_by: caller.userId,
      })
      .select("id, prefix, description, scopes, expires_at, last_used_at, revoked_at, created_at")
      .single();

    if (error) return apiInternalError(error, "integrations/api-keys POST");

    return apiOk({
      key: generated.rawKey, // shown once
      meta: shape(data as KeyRow),
    });
  } catch (e) {
    return apiInternalError(e, "integrations/api-keys POST");
  }
}
