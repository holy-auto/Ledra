import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getClientMeta(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  return { ip, ua };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  const { ip, ua } = getClientMeta(req);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("insurer_search_certificates", {
    p_query: q,
    p_limit: limit,
    p_offset: offset,
    p_ip: ip,
    p_user_agent: ua,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ rows: data ?? [] });
}