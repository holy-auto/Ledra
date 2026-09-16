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
import { withCaller } from "@/lib/api/withCaller";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiForbidden, apiValidationError } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const GET = withCaller<{ id: string }>(
  async (req: NextRequest, { caller, params }) => {
    const { id } = params;
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

    if (error) throw error;

    return apiJson({ calls: data ?? [] });
  },
  { routeName: "passport-consumer calls GET" },
);
