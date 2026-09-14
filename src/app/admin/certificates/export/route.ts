import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { checkAdminFeature, billingDenyResponse } from "@/lib/billing/adminFeatureGate";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";
import { buildCsv, csvDownloadHeaders } from "@/lib/csv/serialize";

export async function GET(req: Request) {
  // @holy-guard:export_search_csv
  const __gate = await checkAdminFeature("export_search_csv", "/admin/certificates");
  if (!__gate.ok) return billingDenyResponse(__gate, "export_search_csv", "/admin/certificates");
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  const { data: mem } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();

  const tenantId = mem?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 400 });
  }

  let query = supabase
    .from("certificates")
    .select(
      "public_id,status,customer_name,vehicle_info_json,content_free_text,expiry_type,expiry_value,created_at,updated_at",
    )
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

  const csvRows = (rows ?? []).map((r) => {
    const v: any = r.vehicle_info_json ?? {};
    return [
      r.public_id,
      r.status,
      r.customer_name,
      (v.model ?? "").toString(),
      (v.plate ?? "").toString(),
      r.content_free_text,
      r.expiry_type,
      r.expiry_value,
      r.created_at,
      r.updated_at,
    ];
  });

  const body = buildCsv(header, csvRows);
  const filename = `certificates_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: csvDownloadHeaders(filename),
  });
}
