import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";

function getClientMeta(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  return { ip, ua };
}

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const pid = req.nextUrl.searchParams.get("pid") ?? "";
  if (!pid) return apiValidationError("Missing pid (public_id) query parameter");

  const { ip, ua } = getClientMeta(req);
  const supabase = await createClient();

  // Use RPC with access control + PII disclosure check + audit logging
  const { data, error } = await supabase.rpc("insurer_get_certificate", {
    p_public_id: pid,
    p_ip: ip,
    p_user_agent: ua,
  });

  if (error) {
    if (error.message.includes("Access denied")) {
      return new Response(JSON.stringify({ error: "access_denied", message: "この証明書へのアクセス権がありません。" }), { status: 403, headers: { "content-type": "application/json" } });
    }
    if (error.message.includes("not found")) {
      return apiNotFound("証明書が見つかりません。");
    }
    return apiValidationError(error.message);
  }

  const cert = Array.isArray(data) ? data[0] : data;
  if (!cert) return apiNotFound("証明書が見つかりません。");

  return NextResponse.json({ certificate: cert });
}
