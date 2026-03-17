import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { checkAdminFeature, billingDenyResponse } from "@/lib/billing/adminFeatureGate";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";

function csvEscape(v: any) {
  const s = (v ?? "").toString();
  const needs = /[",\r\n]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needs ? `"${escaped}"` : escaped;
}

export async function GET(req: Request) {
  // @holy-guard:export_search_csv
  const __gate = await checkAdminFeature("export_search_csv" as any, "/admin/certificates");
  if (!__gate.ok) return billingDenyResponse(__gate as any, "export_search_csv" as any, "/admin/certificates");
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  const tenantId = mem?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 400 });
  }

  let query = supabase
    .from("certificates")
    .select("public_id,status,customer_name,vehicle_info_json,content_free_text,expiry_type,expiry_value,created_at,updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (q) {
    const sq = escapePostgrestValue(escapeIlike(q));
    query = query.or(`public_id.ilike.%${sq}%,customer_name.ilike.%${sq}%`);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const header = [
    "public_id",
    "status",
    "customer_name",
    "vehicle_model",
    "vehicle_plate",
    "content_free_text",
    "expiry_type",
    "expiry_value",
    "created_at",
    "updated_at",
  ];

  const lines: string[] = [];
  lines.push(header.join(","));

  for (const r of rows ?? []) {
    const v: any = r.vehicle_info_json ?? {};
    const model = (v.model ?? "").toString();
    const plate = (v.plate ?? "").toString();

    const line = [
      csvEscape(r.public_id),
      csvEscape(r.status),
      csvEscape(r.customer_name),
      csvEscape(model),
      csvEscape(plate),
      csvEscape(r.content_free_text),
      csvEscape(r.expiry_type),
      csvEscape(r.expiry_value),
      csvEscape(r.created_at),
      csvEscape(r.updated_at),
    ].join(",");

    lines.push(line);
  }

  // Excel対策：UTF-8 BOM
  const bom = "\uFEFF";
  const body = bom + lines.join("\r\n");

  const filename = `certificates_${new Date().toISOString().slice(0,10)}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
