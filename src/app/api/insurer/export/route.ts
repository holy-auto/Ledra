import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function csvEscape(v: unknown) {
  const s = (v ?? "").toString();
  const escaped = s.replace(/"/g, '""');
  if (/[",\r\n]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

function getClientMeta(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  return { ip, ua };
}

import { enforceBilling } from "@/lib/billing/guard";
import { enforceInsurerStatus } from "@/lib/insurer/statusGuard";

export async function GET(req: Request) {
  const deny = await enforceBilling(req, { minPlan: "pro", action: "insurer_export" });
  if (deny) return deny as any;
  const statusDeny = await enforceInsurerStatus();
  if (statusDeny) return statusDeny as any;
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";

  const limit = 2000;
  const offset = 0;

  const { ip, ua } = getClientMeta(req);

  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("insurer_search_certificates", {
    p_query: q,
    p_limit: limit,
    p_offset: offset,
    p_ip: ip,
    p_user_agent: ua,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: logErr } = await supabase.rpc("insurer_audit_log", {
    p_action: "insurer.export.csv",
    p_target_public_id: null,
    p_query_json: { q, limit, offset },
    p_ip: ip,
    p_user_agent: ua,
  });
  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 400 });

  const rows = (data ?? []) as any[];

  const header = ["public_id", "status", "customer_name", "vehicle_model", "vehicle_plate", "created_at", "tenant_id"];
  const lines = [header.join(",")];

  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.public_id),
        csvEscape(r.status),
        csvEscape(r.customer_name),
        csvEscape(r.vehicle_model),
        csvEscape(r.vehicle_plate),
        csvEscape(r.created_at),
        csvEscape(r.tenant_id),
      ].join(",")
    );
  }

  const bom = "\uFEFF";
  const body = bom + lines.join("\r\n");

  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="insurer_certificates_${Date.now()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
