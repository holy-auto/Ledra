/**
 * POST /api/passport/transfers/cancel
 *
 * The initiating tenant cancels a pending transfer. Cannot cancel
 * after it's been accepted/rejected/expired — the audit trail
 * stays immutable past the pending state.
 *
 * Body: { transfer_id }
 *
 * Lives under `/cancel` (not `/[id]/cancel`) so that the
 * tokenized public routes under `/[token]/...` don't collide
 * with a tenant-authed UUID-parameter route at the same depth
 * (Next.js disallows sibling dynamic segments).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiValidationError,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiError,
  apiInternalError,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { hasMinRole } from "@/lib/auth/roles";
import { cancelTransferById } from "@/lib/passport/transfers/respond";

export const dynamic = "force-dynamic";

const schema = z.object({
  transfer_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasMinRole(caller.role, "admin")) return apiForbidden("この操作には管理者権限が必要です。");

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "リクエスト内容が正しくありません。");
    }

    const res = await cancelTransferById({
      transferId: parsed.data.transfer_id,
      tenantId: caller.tenantId,
    });
    if (!res.ok) {
      switch (res.reason) {
        case "not_found":
          return apiNotFound(res.message);
        case "forbidden":
          return apiForbidden(res.message);
        case "not_pending":
          return apiError({ code: "conflict", message: res.message, status: 409 });
      }
    }

    return apiOk({ cancelled: true });
  } catch (e) {
    return apiInternalError(e, "passport/transfers/cancel");
  }
}
