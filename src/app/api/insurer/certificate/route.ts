import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logInsurerAccess } from "@/lib/insurer/audit";

export const runtime = "nodejs";

/**
 * GET /api/insurer/certificate?pid=PUBLIC_ID
 *
 * public_id ベースで証明書を取得する（保険会社閲覧用）。
 * 既存の /api/insurer/certificate/[id] (UUID指定) と併存する。
 */
export async function GET(req: NextRequest) {
  const pid = req.nextUrl.searchParams.get("pid") ?? "";

  if (!pid) {
    return NextResponse.json(
      { error: "Missing pid (public_id) query parameter" },
      { status: 400 },
    );
  }

  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: cert, error } = await sb
    .from("certificates")
    .select("*")
    .eq("public_id", pid)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!cert) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
