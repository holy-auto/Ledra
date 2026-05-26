/**
 * GET /api/admin/platform/passport-consumers/[id]/calls
 *
 * Platform-admin only. Returns the consumer's most recent API calls
 * (up to 100) for incident triage: which VINs they're hitting, what
 * status codes, how slowly. The /[id] summary route exposes 30-day
 * aggregates; this endpoint is for raw inspection when something's off.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const url = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid query");
    }
    const limit = parsed.data.limit ?? 100;

    const admin = createPlatformScopedAdmin("passport-consumer calls — raw call log inspection");

    const { data, error } = await admin
      .from("passport_api_call_logs")
      .select(
        "id, api_key_id, endpoint, vin_queried_normalized, response_status, " +
          "response_time_ms, ip_hash, user_agent, called_at",
      )
      .eq("consumer_id", id)
      .order("called_at", { ascending: false })
      .limit(limit);

    if (error) return apiInternalError(error, "passport-consumer calls GET");

    return apiJson({ calls: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "passport-consumer calls GET");
  }
}
