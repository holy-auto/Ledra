import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logInsurerAccess } from "@/lib/insurer/audit";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * GET /api/insurer/certificate?pid=PUBLIC_ID
 *
 * public_id ベースで証明書を取得する（保険会社閲覧用）。
 * 既存の /api/insurer/certificate/[id] (UUID指定) と併存する。
 */
export async function GET(req: NextRequest) {
  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const pid = req.nextUrl.searchParams.get("pid") ?? "";

  if (!pid) {
    return apiValidationError("Missing pid (public_id) query parameter");
  }

  const sb = await createClient();

  const { data: cert, error } = await sb
    .from("certificates")
    .select("*")
    .eq("public_id", pid)
    .maybeSingle();

  if (error) {
    return apiValidationError(error.message);
  }

  if (!cert) {
    return apiNotFound("証明書が見つかりません。");
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;

  try {
    await logInsurerAccess({
      action: "view",
      certificateId: cert.id,
      meta: { route: "GET /api/insurer/certificate?pid", public_id: pid },
      ip,
      userAgent: ua,
    });
  } catch {
    // 監査ログ失敗は閲覧をブロックしない
  }

  return NextResponse.json({ certificate: cert });
}
