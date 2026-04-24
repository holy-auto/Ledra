import { NextRequest, NextResponse } from "next/server";
import { apiJson, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getPublicCertificateData } from "@/lib/certificate/publicData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Rate limit: 30 requests per IP per minute
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`public-status:${ip}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) {
      return apiJson(
        { error: "rate_limited", message: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const pid = req.nextUrl.searchParams.get("pid") ?? req.nextUrl.searchParams.get("public_id");
    if (!pid) return apiValidationError("pid は必須です。");

    const data = await getPublicCertificateData(pid);
    if (!data) return apiNotFound("証明書が見つかりません。");

    return apiJson(data, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (e) {
    return apiInternalError(e, "public-status");
  }
}
