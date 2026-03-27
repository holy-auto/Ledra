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
  const status = url.searchParams.get("status") ?? "";
  const dateFrom = url.searchParams.get("date_from") ?? "";
  const dateTo = url.searchParams.get("date_to") ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  const { ip, ua } = getClientMeta(req);

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("insurer_search_certificates", {
    p_query: q,
    p_limit: limit,
    p_offset: offset,
    p_ip: ip,
    p_user_agent: ua,
    ...(status ? { p_status: status.toLowerCase() } : {}),
    ...(dateFrom ? { p_date_from: dateFrom } : {}),
    ...(dateTo ? { p_date_to: dateTo } : {}),
  });

  if (error) {
    // Fallback: if RPC doesn't support new params yet, retry without them and filter in JS
    if (error.message?.includes("p_status") || error.message?.includes("p_date_from") || error.message?.includes("p_date_to")) {
      const { data: fallbackData, error: fallbackErr } = await supabase.rpc("insurer_search_certificates", {
        p_query: q,
        p_limit: limit,
        p_offset: offset,
        p_ip: ip,
        p_user_agent: ua,
      });

      if (fallbackErr) return apiValidationError(fallbackErr.message);

      let rows: any[] = fallbackData ?? [];

      if (status) {
        const s = status.toLowerCase();
        rows = rows.filter((r: any) => {
          const rowStatus = String(
            r?.status ?? r?.latest_active_certificate_status ?? r?.latest_certificate_status ?? r?.certificate_status ?? ""
          ).toLowerCase();
          return rowStatus === s;
        });
      }

      if (dateFrom) {
        const from = new Date(dateFrom);
        if (!Number.isNaN(from.getTime())) {
          rows = rows.filter((r: any) => {
            const createdAt = String(r?.created_at ?? r?.latest_active_certificate_created_at ?? r?.latest_certificate_created_at ?? "");
            if (!createdAt) return true;
            return new Date(createdAt) >= from;
          });
        }
      }

      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (!Number.isNaN(to.getTime())) {
          rows = rows.filter((r: any) => {
            const createdAt = String(r?.created_at ?? r?.latest_active_certificate_created_at ?? r?.latest_certificate_created_at ?? "");
            if (!createdAt) return true;
            return new Date(createdAt) <= to;
          });
        }
      }

      return NextResponse.json({ rows });
    }

    return apiValidationError(error.message);
  }

  return NextResponse.json({ rows: data ?? [] });
}
