import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiValidationError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";

function getClientMeta(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  return { ip, ua };
}

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  const { ip, ua } = getClientMeta(req);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("insurer_search_stores", {
    p_query: q,
    p_limit: limit,
    p_offset: offset,
    p_ip: ip,
    p_user_agent: ua,
  });

  if (error) return apiValidationError(error.message);

  return NextResponse.json({ rows: data ?? [] });
}
