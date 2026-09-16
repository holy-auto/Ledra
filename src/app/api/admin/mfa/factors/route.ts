/**
 * GET /api/admin/mfa/factors
 *
 * List the MFA factors registered for the current admin session.
 * The UI renders this to let users see and unenroll existing factors.
 */

import { apiOk, apiInternalError, apiError } from "@/lib/api/response";
import { listFactors } from "@/lib/auth/mfa";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

export const GET = withCaller(
  async (_req, { caller, supabase }) => {
    try {
      const r = await listFactors(supabase);
      if (!r.ok) return apiError({ code: "auth_error", message: r.error, status: 400 });

      return apiOk({ factors: r.data });
    } catch (e) {
      return apiInternalError(e, "admin/mfa/factors");
    }
  },
  { routeName: "admin/mfa/factors" },
);
