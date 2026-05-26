/**
 * POST /api/passport/transfers/[token]/reject
 *
 * The recipient rejects the transfer. Idempotent on already-
 * rejected rows.
 */
import type { NextRequest } from "next/server";
import { apiOk, apiNotFound, apiError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { rejectTransferByToken } from "@/lib/passport/transfers/respond";
import { isTransferTokenFormat } from "@/lib/passport/transfers/tokens";
import { isPassportPublicEnabled } from "@/lib/passport/featureGate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    if (!isPassportPublicEnabled()) return apiNotFound("リンクが無効です。");

    const limited = await checkRateLimit(req, "sensitive");
    if (limited) return limited;

    const { token } = await ctx.params;
    if (!isTransferTokenFormat(token)) return apiNotFound("リンクが無効です。");

    const res = await rejectTransferByToken(token);
    if (!res.ok) {
      switch (res.reason) {
        case "not_found":
          return apiNotFound(res.message);
        case "not_pending":
        case "expired":
          return apiError({ code: "conflict", message: res.message, status: 409 });
      }
    }

    return apiOk({ rejected: true });
  } catch (e) {
    return apiInternalError(e, "passport/transfers/reject");
  }
}
