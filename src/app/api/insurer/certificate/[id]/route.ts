import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logInsurerAccess } from "@/lib/insurer/audit";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const { id } = await ctx.params;

  const sb = await createClient();

  const { data: cert, error } = await sb
    .from("certificates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return apiValidationError(error.message);
  if (!cert) return apiNotFound("証明書が見つかりません。");

  // Verify insurer has an active contract with the certificate's tenant
  const { data: contract } = await sb
    .from("insurer_tenant_contracts")
    .select("id")
    .eq("insurer_id", caller.insurerId)
    .eq("tenant_id", cert.tenant_id)
    .eq("status", "active")
    .maybeSingle();

  if (!contract) {
    return apiNotFound("証明書が見つかりません。");
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;

  try {
    await logInsurerAccess({
      action: "view",
      certificateId: id,
      meta: { route: "GET /api/insurer/certificate/[id]" },
      ip,
      userAgent: ua,
    });
  } catch {
    // 監査ログ失敗は閲覧をブロックしない
  }

  return NextResponse.json({ certificate: cert });
}
