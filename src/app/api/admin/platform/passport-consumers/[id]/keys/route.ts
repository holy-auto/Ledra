/**
 * POST /api/admin/platform/passport-consumers/[id]/keys
 *
 * Issue a new passport API key for a consumer. The raw `lpk_live_…`
 * value is returned ONCE in this response and is unrecoverable
 * afterwards (Stripe-style). Only the prefix + hash live in the DB.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { generatePassportApiKey } from "@/lib/passport/api/keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KNOWN_SCOPES = ["*", "passport:verify", "passport:marketplace"] as const;

const issueSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(KNOWN_SCOPES)).min(1).max(KNOWN_SCOPES.length).optional(),
  expires_at: z
    .string()
    .datetime()
    .optional()
    .refine((v) => !v || new Date(v).getTime() > Date.now(), { message: "expires_at_in_past" }),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = issueSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const admin = createPlatformScopedAdmin("passport-consumer key issue — generate new lpk_live key");

    // Make sure the consumer exists before we generate a key, so a
    // typo in :id can't pollute the keys table with orphaned rows.
    const { data: consumer, error: cErr } = await admin
      .from("passport_api_consumers")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (cErr) return apiInternalError(cErr, "passport-consumer keys POST: lookup");
    if (!consumer) return apiNotFound("consumer_not_found");

    let generated: ReturnType<typeof generatePassportApiKey>;
    try {
      generated = generatePassportApiKey();
    } catch (e) {
      // Pepper missing → server config issue.
      return apiInternalError(e, "passport-consumer keys POST: generate");
    }

    const { data, error } = await admin
      .from("passport_api_keys")
      .insert({
        consumer_id: id,
        name: parsed.data.name,
        key_prefix: generated.prefix,
        key_hash: generated.keyHash,
        scopes: parsed.data.scopes ?? ["passport:verify"],
        expires_at: parsed.data.expires_at ?? null,
      })
      .select("id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at")
      .single();
    if (error) return apiInternalError(error, "passport-consumer keys POST: insert");

    return apiJson({
      key: generated.rawKey, // shown once — never returned again
      meta: data,
    });
  } catch (e) {
    return apiInternalError(e, "passport-consumer keys POST");
  }
}
