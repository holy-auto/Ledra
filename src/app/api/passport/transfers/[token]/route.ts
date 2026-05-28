/**
 * GET /api/passport/transfers/[token]
 *
 * Public read by raw transfer token. Returns the minimal data
 * the recipient needs to decide accept vs reject. No tenant
 * scoping needed — the token is the credential.
 *
 * Token is a URL path segment because email clients render it
 * as part of a single clickable link more reliably than a query
 * string. The token is sensitive but short-lived (≤30d) and
 * stored only as a hash.
 */
import type { NextRequest } from "next/server";
import { apiOk, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { getTransferByToken } from "@/lib/passport/transfers/respond";
import { isTransferTokenFormat } from "@/lib/passport/transfers/tokens";
import { isPassportPublicEnabled } from "@/lib/passport/featureGate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    if (!isPassportPublicEnabled()) return apiNotFound("リンクが無効です。");

    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const { token } = await ctx.params;
    if (!isTransferTokenFormat(token)) return apiNotFound("リンクが無効です。");

    const view = await getTransferByToken(token);
    if (!view) return apiNotFound("リンクが無効です。");

    return apiOk({ transfer: view });
  } catch (e) {
    return apiInternalError(e, "passport/transfers/[token] GET");
  }
}
