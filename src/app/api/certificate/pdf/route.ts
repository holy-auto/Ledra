import React from "react";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";

export const dynamic = "force-dynamic";

type CertPublic = {
  public_id: string;
  status: string;
  customer_name: string | null;
  vehicle_info_json: any | null;
  content_free_text: string | null;
  content_preset_json: any | null;
  expiry_type: string | null;
  expiry_value: string | null;
  logo_asset_path: string | null;
  footer_variant: string | null;
  current_version: number | null;
  created_at: string | null;
  tenant_name: string | null;
  tenant_slug: string | null;
  tenant_custom_domain?: string | null;
};

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 18 },
  meta: { color: "#666", marginTop: 4 },
  box: { borderWidth: 1, borderColor: "#ddd", padding: 10, borderRadius: 6, marginTop: 10 },
  label: { color: "#666", fontSize: 9 },
  value: { fontSize: 12, marginTop: 2 },
  footer: { marginTop: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#ddd", color: "#666" },
  qr: { width: 90, height: 90, borderWidth: 1, borderColor: "#ddd", borderRadius: 4 },
  small: { fontSize: 8, color: "#666" },
});

function buildOriginFromCert(cert: { tenant_custom_domain?: string | null }, fallbackOrigin: string) {
  if (cert.tenant_custom_domain) return `https://${cert.tenant_custom_domain}`;
  if (process.env.APP_URL) return process.env.APP_URL;
  return fallbackOrigin;
}

async function getFallbackOrigin(): Promise<string> {
  const h = await headers(); // Next.js 16: Promise
  const xfProto = h.get("x-forwarded-proto");
  const xfHost = h.get("x-forwarded-host");
  const host = xfHost ?? h.get("host") ?? "localhost:3000";
  const proto = xfProto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function fetchCertPublic(pid: string): Promise<CertPublic | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const q = new URL(`${url}/rest/v1/certificates_public`);
  q.searchParams.set("select", "*");
  q.searchParams.set("public_id", `eq.${pid}`);
  q.searchParams.set("limit", "1");

  const res = await fetch(q.toString(), {
    method: "GET",
    cache: "no-store",
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });

  if (!res.ok) return null;
  const rows = (await res.json()) as CertPublic[];
  return rows?.[0] ?? null;
}

async function pngUrlToDataUrl(pngUrl: string): Promise<string> {
  const res = await fetch(pngUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch QR png: ${res.status}`);
  const ab = await res.arrayBuffer();
  const b64 = Buffer.from(ab).toString("base64");
  return `data:image/png;base64,${b64}`;
}

function PdfDocEl(cert: CertPublic, publicUrl: string, qrDataUrl: string) {
  const E = React.createElement;

  return E(
    Document,
    null,
    E(
      Page,
      { size: "A4", style: styles.page },
      E(
        View,
        { style: styles.header },
        E(
          View,
          null,
          E(Text, { style: styles.title }, cert.tenant_name ?? "施工店"),
          E(Text, { style: styles.meta }, "施工証明書（PDF）"),
          E(Text, { style: styles.meta }, `Public ID: ${cert.public_id}`)
        ),
        E(
          View,
          { style: { alignItems: "flex-end" } },
          E(Image, { src: qrDataUrl, style: styles.qr }),
          E(Text, { style: styles.small }, publicUrl)
        )
      ),

      E(
        View,
        { style: styles.box },
        E(Text, { style: styles.label }, "お客様"),
        E(Text, { style: styles.value }, cert.customer_name ?? "-")
      ),

      E(
        View,
        { style: styles.box },
        E(Text, { style: styles.label }, "施工内容"),
        E(Text, { style: styles.value }, cert.content_free_text ?? "-")
      ),

      E(
        View,
        { style: styles.box },
        E(Text, { style: styles.label }, "有効条件"),
        E(
          Text,
          { style: styles.value },
          `${(cert.expiry_type ?? "").toString()}: ${(cert.expiry_value ?? "").toString()}`
        )
      ),

      E(
        View,
        { style: styles.footer },
        E(Text, null, `公開URL: ${publicUrl}`),
        E(Text, null, "HOLY監修フッター（信頼担保）")
      )
    )
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pid = (searchParams.get("pid") ?? "").trim();

  if (!/^[a-f0-9]{32}$/i.test(pid)) {
    return NextResponse.json({ error: "invalid pid" }, { status: 400 });
  }

  const cert = await fetchCertPublic(pid);
  if (!cert || (cert.status ?? "").toLowerCase() !== "active") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const fallbackOrigin = await getFallbackOrigin();
  const origin = buildOriginFromCert(cert, fallbackOrigin);
  const publicUrl = `${origin}/c/${cert.public_id}`;

  const qrPngUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(publicUrl)}`;
  const qrDataUrl = await pngUrlToDataUrl(qrPngUrl);

  const buf = await renderToBuffer(PdfDocEl(cert, publicUrl, qrDataUrl));

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificate_${cert.public_id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}