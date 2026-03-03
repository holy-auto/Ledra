import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logInsurerAccess } from "@/lib/insurer/audit";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cert, error } = await sb
    .from("certificates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!cert) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;

  await logInsurerAccess({
    action: "view",
    certificateId: id,
    meta: { route: "GET /api/insurer/certificate/[id]" },
    ip,
    userAgent: ua,
  });

  return NextResponse.json({ certificate: cert });
}