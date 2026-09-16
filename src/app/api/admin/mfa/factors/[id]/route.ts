/**
 * DELETE /api/admin/mfa/factors/[id]
 *
 * Unenroll a TOTP factor for the current user. Supabase Auth ensures the
 * factor belongs to the calling user (the operation is bounded by the
 * session JWT) — we still pass the id explicitly.
 */

import { z } from "zod";
import { withCaller } from "@/lib/api/withCaller";
import { apiOk, apiValidationError, apiError } from "@/lib/api/response";
import { unenrollFactor } from "@/lib/auth/mfa";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid("invalid_factor_id");

export const DELETE = withCaller<{ id: string }>(
  async (_req, { supabase, params }) => {
    const { id } = params;
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return apiValidationError("invalid_factor_id");

    const r = await unenrollFactor(supabase, parsed.data);
    if (!r.ok) return apiError({ code: "auth_error", message: r.error, status: 400 });

    return apiOk({ ok: true });
  },
  { routeName: "admin/mfa/factors DELETE" },
);
