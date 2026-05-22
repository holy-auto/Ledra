/**
 * POST /api/passport/transfers/[token]/accept
 *
 * The recipient accepts the transfer. Token is the credential.
 * Optional body: { to_name? } — the new owner can supply their
 * display name (or override what the shop pre-filled).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiValidationError, apiNotFound, apiError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { acceptTransferByToken } from "@/lib/passport/transfers/respond";
import { isTransferTokenFormat } from "@/lib/passport/transfers/tokens";

export const dynamic = "force-dynamic";

const schema = z.object({
  to_name: z.string().max(120).optional().nullable(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    // Sensitive: tighter limiter to slow down token-bruteforce
    // attempts and to bound retries from a hostile recipient.
    const limited = await checkRateLimit(req, "sensitive");
    if (limited) return limited;

    const { token } = await ctx.params;
    if (!isTransferTokenFormat(token)) return apiNotFound("リンクが無効です。");

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "リクエスト内容が正しくありません。");
    }

    const res = await acceptTransferByToken({
      rawToken: token,
      acceptedByName: parsed.data.to_name ?? null,
    });
    if (!res.ok) {
      switch (res.reason) {
        case "not_found":
          return apiNotFound(res.message);
        case "not_pending":
          return apiError({ code: "conflict", message: res.message, status: 409 });
        case "expired":
          return apiError({ code: "conflict", message: res.message, status: 410 });
        case "db_error":
          return apiInternalError(new Error(res.message), "passport/transfers/accept");
      }
    }

    return apiOk({ accepted: true });
  } catch (e) {
    return apiInternalError(e, "passport/transfers/accept");
  }
}
