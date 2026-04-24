import { NextResponse, type NextRequest } from "next/server";
import { logInsurerAccess } from "@/lib/insurer/audit";
import { createClient } from "@/lib/supabase/server";
import { resolveInsurerCaller, enforceInsurerPlan } from "@/lib/api/insurerAuth";
import QRCode from "qrcode";
import React from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import { InsurerPdfDoc } from "@/lib/insurerPdfDoc";
import { apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

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

export async function GET(req: NextRequest) {
  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const planDeny = enforceInsurerPlan(caller, "pro");
  if (planDeny) return planDeny;

  const url = new URL(req.url);
  const pid = url.searchParams.get("pid");
  if (!pid) return apiValidationError("pid is required");

  const { ip, ua } = getClientMeta(req);

  const supabase = await createClient();

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

  // InsurerPdfDoc は <Document> を返すが戻り値型に DocumentProps の
  // element 型を持っていないため、@react-pdf/renderer の pdf() に渡すには
  // ReactElement<DocumentProps> として narrow する必要がある。
  const docEl = React.createElement(InsurerPdfDoc, {
    cert,
    qrDataUrl,
    publicUrl,
  }) as unknown as React.ReactElement<DocumentProps>;

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

  // @react-pdf/renderer's browser lib types this as `Buffer | ReadableStream`,
  // but on Node runtime it is always a Buffer. Narrow and copy to a fresh
  // Uint8Array<ArrayBuffer> so NextResponse gets a valid BodyInit and we
  // detach from Node's shared Buffer pool.
  const buffer = await pdf(docEl).toBuffer();
  if (!(buffer instanceof Uint8Array)) {
    throw new Error("[insurer/pdf-one] renderer returned a stream instead of a buffer");
  }
  const buf = Uint8Array.from(buffer);
  return new NextResponse(buf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="insurer_certificate_${pid}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
