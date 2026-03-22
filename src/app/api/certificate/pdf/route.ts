import { enforceBilling } from "@/lib/billing/guard";
import React from "react";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import { logCertificateAction, getRequestMeta } from "@/lib/audit/certificateLog";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { renderBrandedCertificatePdf } from "@/lib/template-options/renderBrandedCertificate";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import type { TemplateConfig } from "@/types/templateOption";
import type { CertRow } from "@/lib/pdfCertificate";

export const dynamic = "force-dynamic";

const NOTO_SANS_JP =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-400-normal.ttf";
const NOTO_SANS_JP_BOLD =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-700-normal.ttf";

Font.register({
  family: "NotoSansJP",
  fonts: [
    { src: NOTO_SANS_JP, fontWeight: 400 },
    { src: NOTO_SANS_JP_BOLD, fontWeight: 700 },
  ],
});

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
  page: { padding: 28, fontSize: 10, fontFamily: "NotoSansJP" },
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
  // Rate limit: 10 PDF generations per IP per minute (heavy operation)
  const ip = getClientIp(req);
  const rl = checkRateLimit(`pdf:${ip}`, { limit: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const deny = await enforceBilling(req as any, { minPlan: "free", action: "public_pdf" });
  if (deny) return deny as any;
  const { searchParams } = new URL(req.url);
  const pid = (searchParams.get("pid") ?? "").trim();

  if (!/^[a-f0-9]{32}$/i.test(pid)) {
    return apiValidationError("無効な公開IDです。");
  }

  const cert = await fetchCertPublic(pid);
  if (!cert || (cert.status ?? "").toLowerCase() !== "active") {
    return apiNotFound("証明書が見つかりません。");
  }

  // 公開PDF閲覧ログ（tenant_id を取得して記録）
  try {
    const adm = createAdminClient();
    const { data: certRow } = await adm
      .from("certificates")
      .select("tenant_id,id,vehicle_id")
      .eq("public_id", pid)
      .limit(1)
      .maybeSingle();
    if (certRow?.tenant_id) {
      const meta = getRequestMeta(req);
      logCertificateAction({
        type: "certificate_public_pdf",
        tenantId: certRow.tenant_id as string,
        publicId: pid,
        certificateId: certRow.id as string,
        vehicleId: certRow.vehicle_id as string | null,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }
  } catch { /* audit failure should not block PDF */ }

  const fallbackOrigin = await getFallbackOrigin();
  const origin = buildOriginFromCert(cert, fallbackOrigin);
  const publicUrl = `${origin}/c/${cert.public_id}`;

  // ── ブランドテンプレートが有効ならブランドPDFを生成 ──
  try {
    const adm2 = createAdminClient();
    const certForTenant = await adm2
      .from("certificates")
      .select("tenant_id")
      .eq("public_id", pid)
      .limit(1)
      .maybeSingle();

    if (certForTenant?.data?.tenant_id) {
      const { data: activeSub } = await adm2
        .from("tenant_option_subscriptions")
        .select("template_config_id")
        .eq("tenant_id", certForTenant.data.tenant_id)
        .in("status", ["active", "past_due"])
        .limit(1)
        .maybeSingle();

      if (activeSub?.template_config_id) {
        const { data: tplConfig } = await adm2
          .from("tenant_template_configs")
          .select("config_json, is_active")
          .eq("id", activeSub.template_config_id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (tplConfig?.config_json) {
          // Fetch additional fields for PPF support
          const { data: fullCert } = await adm2
            .from("certificates")
            .select("ppf_coverage_json, service_type, coating_products_json, warranty_period_end, warranty_exclusions, current_version")
            .eq("public_id", pid)
            .limit(1)
            .maybeSingle();

          const brandedRow: CertRow = {
            public_id: cert.public_id,
            customer_name: cert.customer_name ?? "",
            vehicle_info_json: cert.vehicle_info_json ?? {},
            content_free_text: cert.content_free_text ?? null,
            content_preset_json: cert.content_preset_json ?? {},
            coating_products_json: (fullCert?.coating_products_json as any[] | null) ?? null,
            ppf_coverage_json: (fullCert?.ppf_coverage_json as any[] | null) ?? null,
            service_type: (fullCert?.service_type as string | null) ?? null,
            expiry_type: cert.expiry_type ?? null,
            expiry_value: cert.expiry_value ?? null,
            warranty_period_end: (fullCert?.warranty_period_end as string | null) ?? null,
            warranty_exclusions: (fullCert?.warranty_exclusions as string | null) ?? null,
            logo_asset_path: cert.logo_asset_path ?? null,
            created_at: cert.created_at ?? new Date().toISOString(),
            tenant_custom_domain: cert.tenant_custom_domain,
            current_version: (fullCert?.current_version as number | null) ?? null,
          };

          const brandedBuf = await renderBrandedCertificatePdf(
            brandedRow,
            publicUrl,
            tplConfig.config_json as TemplateConfig,
          );

          const ab = (brandedBuf as any).buffer
            ? (brandedBuf as any).buffer.slice((brandedBuf as any).byteOffset ?? 0, ((brandedBuf as any).byteOffset ?? 0) + (brandedBuf as any).byteLength)
            : brandedBuf;

          return new NextResponse(ab as any, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `inline; filename="certificate_${cert.public_id}.pdf"`,
              "Cache-Control": "no-store",
            },
          });
        }
      }
    }
  } catch (brandErr) {
    // ブランドテンプレ失敗時は標準テンプレにフォールバック
    console.error("branded template fallback:", brandErr instanceof Error ? brandErr.message : brandErr);
  }

  const qrPngUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(publicUrl)}`;
  const qrDataUrl = await pngUrlToDataUrl(qrPngUrl);

  const buf = await renderToBuffer(PdfDocEl(cert, publicUrl, qrDataUrl));

  const ab = (buf as any).buffer
    ? (buf as any).buffer.slice((buf as any).byteOffset ?? 0, ((buf as any).byteOffset ?? 0) + (buf as any).byteLength)
    : buf;

  return new NextResponse(ab as any, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificate_${cert.public_id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
