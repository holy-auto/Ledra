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
  const status = url.searchParams.get("status") ?? "";
  const dateFrom = url.searchParams.get("date_from") ?? "";
  const dateTo = url.searchParams.get("date_to") ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  // When JS filters are active, fetch more rows from RPC to compensate for post-filter reduction
  const hasJsFilters = !!(status || dateFrom || dateTo);
  const rpcLimit = hasJsFilters ? Math.min(limit * 4, 800) : limit;

  const { ip, ua } = getClientMeta(req);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("insurer_search_certificates", {
    p_query: q,
    p_limit: rpcLimit,
    p_offset: offset,
    p_ip: ip,
    p_user_agent: ua,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let rows: any[] = data ?? [];

  // Post-RPC filtering for status, date_from, date_to
  // (applied here for RPC compatibility — ideally move to DB function)
  if (status) {
    const s = status.toLowerCase();
    rows = rows.filter((r: any) => {
      const rowStatus = String(
        r?.status ??
        r?.latest_active_certificate_status ??
        r?.latest_certificate_status ??
        r?.certificate_status ??
        ""
      ).toLowerCase();
      return rowStatus === s;
    });
  }

  if (dateFrom) {
    const fromTs = new Date(dateFrom).getTime();
    if (!Number.isNaN(fromTs)) {
      rows = rows.filter((r: any) => {
        const createdAt =
          r?.created_at ?? r?.latest_active_certificate_created_at ?? r?.latest_certificate_created_at ?? "";
        if (!createdAt) return true;
        return new Date(createdAt).getTime() >= fromTs;
      });
    }
  }

  if (dateTo) {
    // Include the full dateTo day (end of day)
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    const toTs = to.getTime();
    if (!Number.isNaN(toTs)) {
      rows = rows.filter((r: any) => {
        const createdAt =
          r?.created_at ?? r?.latest_active_certificate_created_at ?? r?.latest_certificate_created_at ?? "";
        if (!createdAt) return true;
        return new Date(createdAt).getTime() <= toTs;
      });
    }
  }

  // Trim to requested limit after JS filtering
  if (hasJsFilters && rows.length > limit) {
    rows = rows.slice(0, limit);
  }

  return NextResponse.json({ rows });
}
