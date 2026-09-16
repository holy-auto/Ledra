/**
 * POST /api/admin/mfa/verify-enroll
 * Body: { factor_id, code }
 *
 * /enroll で受け取った factor_id と TOTP アプリの 6 桁コードで verify。
 * 成功するとセッションが aal2 に昇格し、以降の admin route で 2FA を満たした扱いになる。
 */

import { z } from "zod";

import { apiOk, apiInternalError, apiValidationError, apiError } from "@/lib/api/response";
import { verifyEnroll } from "@/lib/auth/mfa";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

const schema = z.object({
  factor_id: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, "invalid_code"),
});

export const POST = withCaller(
  async (req, { caller, supabase }) => {
    try {

      const parsed = schema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

      const r = await verifyEnroll(supabase, parsed.data.factor_id, parsed.data.code);
      if (!r.ok) {
        return apiError({ code: "auth_error", message: r.error, status: 400 });
      }

      return apiOk({ ok: true });
    } catch (e) {
      return apiInternalError(e, "admin/mfa/verify-enroll");
    }
  },
  { routeName: "admin/mfa/verify-enroll" },
);
