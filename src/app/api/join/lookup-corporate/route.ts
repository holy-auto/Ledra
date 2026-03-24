import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  isValidCorporateNumber,
  verifyCorporateNumberViaApi,
} from "@/lib/insurer/corporateNumber";

export const runtime = "nodejs";

/**
 * GET /api/join/lookup-corporate?number=1234567890123
 * Looks up a corporate number via gBizINFO and returns company details.
 * Rate limited to prevent abuse.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`gbiz-lookup:${ip}`, { limit: 15, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const number = req.nextUrl.searchParams.get("number")?.trim() ?? "";

  if (!number || !isValidCorporateNumber(number)) {
    return NextResponse.json(
      { error: "invalid_number", message: "法人番号の形式が正しくありません（13桁の数字）" },
      { status: 400 },
    );
  }

  const info = await verifyCorporateNumberViaApi(number);

  if (!info) {
    return NextResponse.json(
      { error: "not_found", message: "該当する法人情報が見つかりませんでした" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    corporate_number: info.corporateNumber,
    company_name: info.name,
    address: info.location,
    representative_name: info.representativeName,
  });
}
