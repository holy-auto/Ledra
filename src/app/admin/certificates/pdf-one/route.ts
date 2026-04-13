import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { renderCertificatePdf } from "@/lib/pdfCertificate";
import { checkAdminFeature, billingDenyResponse } from "@/lib/billing/adminFeatureGate";
import { logCertificateAction } from "@/lib/audit/certificateLog";

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
    .select("id,public_id,customer_name,vehicle_info_json,content_free_text,content_preset_json,expiry_type,expiry_value,logo_asset_path,created_at,service_type,ppf_coverage_json,coating_products_json,warranty_period_end,warranty_exclusions,current_version,maintenance_json,body_repair_json")
    .eq("tenant_id", tenantId)
    .eq("public_id", pid)
    .single();

  if (error || !row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // アンカー済み画像を取得 (Polygonscan QR 埋め込み用)
  const { data: images } = await supabase
    .from("certificate_images")
    .select("sha256, polygon_tx_hash, polygon_network")
    .eq("certificate_id", (row as { id: string }).id)
    .not("polygon_tx_hash", "is", null)
    .order("sort_order", { ascending: true });
  const anchors = (images ?? []).map((i) => ({
    sha256: (i.sha256 as string | null) ?? null,
    polygon_tx_hash: (i.polygon_tx_hash as string | null) ?? null,
    polygon_network:
      i.polygon_network === "polygon" || i.polygon_network === "amoy"
        ? (i.polygon_network as "polygon" | "amoy")
        : null,
  }));

  logCertificateAction({
    type: "certificate_pdf_generated",
    tenantId,
    publicId: pid,
    userId: userRes.user.id,
  });

  // baseUrl（APP_URL依存なし）
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;
  const publicUrl = `${baseUrl}/c/${row.public_id}`;

  const pdf = await renderCertificatePdf(row as any, publicUrl, anchors);
  const body = new Uint8Array(pdf as any);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
    },
  });
}
