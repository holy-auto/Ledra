import { NextRequest, NextResponse } from "next/server";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/certificate/verify?pid=PUBLIC_ID
 *
 * Minimal verification badge endpoint for embedding in emails / 3rd-party sites.
 * Returns NO customer PII. Returns { verified: false } for unknown IDs
 * (does not reveal whether the ID exists).
 */
export async function GET(req: NextRequest) {
  try {
    // Strict rate limit: 10 req/min per IP
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`cert-verify:${ip}`, { limit: 10, windowSec: 60 });
    if (!rl.allowed) {
      return apiJson(
        { error: "rate_limited", message: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const pid = req.nextUrl.searchParams.get("pid");
    if (!pid) return apiValidationError("pid は必須です。");

    const supabase = createServiceRoleAdmin("public certificate — lookup by public_id, no caller");

    const { data: cert, error } = await supabase
      .from("certificates")
      .select("id, public_id, status, created_at, service_type, tenant_id")
      .eq("public_id", pid)
      .limit(1)
      .maybeSingle();

    if (error) {
      return apiInternalError(error, "certificate-verify fetch");
    }

    // Return unverified for non-existent IDs without revealing existence
    if (!cert) {
      return apiJson({ verified: false }, { status: 200, headers: { "cache-control": "no-store" } });
    }

    // Fetch shop name
    let shopName: string | null = null;
    if (cert.tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name, slug")
        .eq("id", cert.tenant_id)
        .limit(1)
        .maybeSingle<{ name: string | null; slug: string | null }>();
      shopName = tenant?.name ?? tenant?.slug ?? null;
    }

    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/c/${cert.public_id}`;

    // Format issued_at as YYYY-MM-DD
    const issuedAt = cert.created_at ? cert.created_at.slice(0, 10) : null;

    return apiJson(
      {
        verified: true,
        status: cert.status,
        issued_at: issuedAt,
        service_type: cert.service_type ?? null,
        shop_name: shopName,
        verification_url: verificationUrl,
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return apiInternalError(e, "certificate-verify");
  }
}
