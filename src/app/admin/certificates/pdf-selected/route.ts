import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { renderCertificatePdf } from "@/lib/pdfCertificate";
import { checkAdminFeature, billingDenyResponse } from "@/lib/billing/adminFeatureGate";
import { logCertificateAction } from "@/lib/audit/certificateLog";

export async function GET(req: Request) {
  // @holy-guard:pdf_zip_selected
  const __gate = await checkAdminFeature("pdf_zip_selected" as any, "/admin/certificates");
  if (!__gate.ok) return billingDenyResponse(__gate as any, "pdf_zip_selected" as any, "/admin/certificates");
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const raw = (url.searchParams.get("ids") ?? "").trim();
  if (!raw) return NextResponse.json({ error: "missing ids" }, { status: 400 });

  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50); // 安全上限 50
  if (ids.length === 0) return NextResponse.json({ error: "no ids" }, { status: 400 });

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  const tenantId = mem?.tenant_id as string | undefined;
  if (!tenantId) return NextResponse.json({ error: "tenant_not_found" }, { status: 400 });

  const { data: rows, error } = await supabase
    .from("certificates")
    .select("id,public_id,customer_name,vehicle_info_json,content_free_text,content_preset_json,expiry_type,expiry_value,logo_asset_path,created_at,service_type,ppf_coverage_json,coating_products_json,warranty_period_end,warranty_exclusions,current_version,maintenance_json,body_repair_json")
    .eq("tenant_id", tenantId)
    .in("public_id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pids = (rows ?? []).map((r) => r.public_id as string);

  // 一括で全証明書のアンカー情報を取得 (N+1 クエリを回避)
  const certIds = (rows ?? []).map((r) => (r as { id: string }).id);
  const anchorsByCertId = new Map<
    string,
    Array<{ sha256: string | null; polygon_tx_hash: string | null; polygon_network: "polygon" | "amoy" | null }>
  >();
  if (certIds.length > 0) {
    const { data: images } = await supabase
      .from("certificate_images")
      .select("certificate_id, sha256, polygon_tx_hash, polygon_network, sort_order")
      .in("certificate_id", certIds)
      .not("polygon_tx_hash", "is", null)
      .order("sort_order", { ascending: true });
    for (const img of images ?? []) {
      const cid = img.certificate_id as string;
      const list = anchorsByCertId.get(cid) ?? [];
      list.push({
        sha256: (img.sha256 as string | null) ?? null,
        polygon_tx_hash: (img.polygon_tx_hash as string | null) ?? null,
        polygon_network:
          img.polygon_network === "polygon" || img.polygon_network === "amoy"
            ? (img.polygon_network as "polygon" | "amoy")
            : null,
      });
      anchorsByCertId.set(cid, list);
    }
  }

  logCertificateAction({
    type: "certificate_pdf_batch",
    tenantId,
    publicId: pids.join(","),
    userId: userRes.user.id,
    description: `一括PDF生成: ${pids.length}件`,
  });

  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  for (const r of rows ?? []) {
    const publicUrl = `${baseUrl}/c/${r.public_id}`;
    const anchors = anchorsByCertId.get((r as { id: string }).id) ?? [];
    const pdf = await renderCertificatePdf(r as any, publicUrl, anchors);
    zip.file(`certificate_${r.public_id}.pdf`, pdf);
  }

  const out = await zip.generateAsync({ type: "nodebuffer" });
  const filename = `certificates_selected_${new Date().toISOString().slice(0,10)}.zip`;
  const body = new Uint8Array(out as any);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
