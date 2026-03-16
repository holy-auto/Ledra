import { NextResponse } from "next/server";
import { logInsurerAccess } from "@/lib/insurer/audit";
import { createClient } from "@/lib/supabase/server";
import QRCode from "qrcode";
import React from "react";
import { pdf } from "@react-pdf/renderer";
import { InsurerPdfDoc } from "@/lib/insurerPdfDoc";
import { apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";

export const runtime = "nodejs";

function getClientMeta(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  return { ip, ua };
}

function buildBaseUrl(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

import { enforceBilling } from "@/lib/billing/guard";

export async function GET(req: Request) {
  const deny = await enforceBilling(req, { minPlan: "pro", action: "insurer_pdf_one" });
  if (deny) return deny as any;
  const url = new URL(req.url);
  const pid = url.searchParams.get("pid");
  if (!pid) return apiValidationError("pid is required");

  const { ip, ua } = getClientMeta(req);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return apiUnauthorized();

  const { data, error } = await supabase.rpc("insurer_get_certificate", {
    p_public_id: pid,
    p_ip: ip,
    p_user_agent: ua,
  });
  if (error) return apiValidationError(error.message);

  const cert = Array.isArray(data) ? data[0] : null;
  if (!cert) return apiNotFound("証明書が見つかりません。");

  const { error: logErr } = await supabase.rpc("insurer_audit_log", {
    p_action: "insurer.export.pdf.one",
    p_target_public_id: pid,
    p_query_json: null,
    p_ip: ip,
    p_user_agent: ua,
  });
  if (logErr) return apiValidationError(logErr.message);

  const baseUrl = buildBaseUrl(req);
  const publicUrl = `${baseUrl}/c/${encodeURIComponent(pid)}`;

  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(publicUrl, { margin: 1, width: 240 });
  } catch {
    qrDataUrl = "";
  }

  // ★JSXを使わず createElement
  const docEl = React.createElement(InsurerPdfDoc, { cert, qrDataUrl, publicUrl }) as any;
  // Resolve certificate_id reliably from pid (public_id)
  const { data: certIdRow, error: certIdErr } = await supabase
    .from("certificates")
    .select("id")
    .eq("public_id", pid)
    .maybeSingle();
  if (certIdErr) throw certIdErr;
  const certId = certIdRow?.id;
  if (!certId) return apiNotFound("証明書が見つかりません。");
  await logInsurerAccess({
    action: "download_pdf",
    certificateId: certId,
    meta: { route: "GET /api/insurer/pdf-one", pid },
    ip,
    userAgent: ua,
  });
  const buffer = await pdf(docEl as any).toBuffer();

  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as any);
  return new NextResponse(buf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="insurer_certificate_${pid}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
