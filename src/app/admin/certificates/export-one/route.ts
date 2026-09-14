import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { checkAdminFeature, billingDenyResponse } from "@/lib/billing/adminFeatureGate";
import { buildCsv, csvDownloadHeaders } from "@/lib/csv/serialize";

export async function GET(req: Request) {
  // @holy-guard:export_one_csv
  const __gate = await checkAdminFeature("export_one_csv", "/admin/certificates");
  if (!__gate.ok) return billingDenyResponse(__gate, "export_one_csv", "/admin/certificates");
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const pid = (url.searchParams.get("pid") ?? "").trim();
  if (!pid) return NextResponse.json({ error: "missing pid" }, { status: 400 });

  const { data: mem } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();
  const tenantId = mem?.tenant_id as string | undefined;
  if (!tenantId) return NextResponse.json({ error: "tenant_not_found" }, { status: 400 });

  const { data: r, error } = await supabase
    .from("certificates")
    .select(
      "public_id,status,customer_name,vehicle_info_json,content_free_text,expiry_type,expiry_value,created_at,updated_at",
    )
    .eq("tenant_id", tenantId)
    .eq("public_id", pid)
    .single();

  if (error || !r) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const v: any = r.vehicle_info_json ?? {};
  const model = (v.model ?? "").toString();
  const plate = (v.plate ?? "").toString();

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

  const body = buildCsv(header, [
    [
      r.public_id,
      r.status,
      r.customer_name,
      model,
      plate,
      r.content_free_text,
      r.expiry_type,
      r.expiry_value,
      r.created_at,
      r.updated_at,
    ],
  ]);

  const filename = `certificate_${r.public_id}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: csvDownloadHeaders(filename),
  });
}
