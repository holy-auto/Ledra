import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renderCertificatePdf } from "@/lib/pdfCertificate";
import { checkAdminFeature, billingDenyResponse } from "@/lib/billing/adminFeatureGate";

export async function GET(req: Request) {
  // @holy-guard:pdf_one
  const __gate = await checkAdminFeature("pdf_one" as any, "/admin/certificates");
  if (!__gate.ok) return billingDenyResponse(__gate as any, "pdf_one" as any, "/admin/certificates");
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const pid = (url.searchParams.get("pid") ?? "").trim();
  if (!pid) return NextResponse.json({ error: "missing pid" }, { status: 400 });

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  const tenantId = mem?.tenant_id as string | undefined;
  if (!tenantId) return NextResponse.json({ error: "tenant_not_found" }, { status: 400 });

  const { data: row, error } = await supabase
    .from("certificates")
    .select("public_id,customer_name,vehicle_info_json,content_free_text,content_preset_json,expiry_type,expiry_value,logo_asset_path,created_at")
    .eq("tenant_id", tenantId)
    .eq("public_id", pid)
    .single();

  if (error || !row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // baseUrl（APP_URL依存なし）
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;
  const publicUrl = `${baseUrl}/c/${row.public_id}`;

  const pdf = await renderCertificatePdf(row as any, publicUrl);
  const body = new Uint8Array(pdf as any);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
    },
  });
}
