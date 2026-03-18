import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSignedAssetUrl } from "@/lib/signedUrl";
import QRCode from "qrcode";
import type { TemplateConfig } from "@/types/templateOption";
import type { CertRow } from "@/lib/pdfCertificate";

const NOTO_SANS_JP =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-400-normal.ttf";
const NOTO_SANS_JP_BOLD =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-700-normal.ttf";
const NOTO_SERIF_JP =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-serif-jp@latest/japanese-400-normal.ttf";
const NOTO_SERIF_JP_BOLD =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-serif-jp@latest/japanese-700-normal.ttf";

Font.register({
  family: "NotoSansJP",
  fonts: [
    { src: NOTO_SANS_JP, fontWeight: 400 },
    { src: NOTO_SANS_JP_BOLD, fontWeight: 700 },
  ],
});

Font.register({
  family: "NotoSerifJP",
  fonts: [
    { src: NOTO_SERIF_JP, fontWeight: 400 },
    { src: NOTO_SERIF_JP_BOLD, fontWeight: 700 },
  ],
});

// ---- Style builder from config ----

function buildStyles(config: TemplateConfig) {
  const primary = config.branding.primary_color ?? "#1a1a2e";
  const secondary = config.branding.secondary_color ?? "#16213e";
  const accent = config.branding.accent_color ?? "#0071e3";
  const fontFamily = config.style?.font_family === "noto-serif-jp" ? "NotoSerifJP" : "NotoSansJP";

  const borderWidth = config.style?.border_style === "none" ? 0
    : config.style?.border_style === "double" ? 2
    : config.style?.border_style === "elegant" ? 1.5
    : 1;

  const bgColor = config.style?.background_variant === "cream" ? "#faf8f5"
    : config.style?.background_variant === "light-gray" ? "#f5f5f7"
    : "#ffffff";

  return StyleSheet.create({
    page: {
      padding: 32,
      fontSize: 10,
      fontFamily,
      backgroundColor: bgColor,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 16,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    title: {
      fontSize: 20,
      fontWeight: 700,
      color: primary,
    },
    subtitle: {
      fontSize: 11,
      color: secondary,
      marginTop: 2,
    },
    meta: {
      fontSize: 9,
      color: "#666",
      marginTop: 4,
    },
    box: {
      borderWidth,
      borderColor: accent + "40",
      padding: 12,
      borderRadius: 6,
      marginTop: 10,
    },
    boxTitle: {
      fontSize: 11,
      fontWeight: 700,
      color: primary,
      marginBottom: 6,
    },
    label: {
      fontSize: 9,
      color: "#666",
    },
    value: {
      fontSize: 12,
      marginTop: 2,
      color: primary,
    },
    itemRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 3,
    },
    itemLabel: {
      width: 140,
      color: "#666",
      fontSize: 9,
    },
    itemValue: {
      flex: 1,
      fontSize: 10,
    },
    footer: {
      marginTop: 20,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: accent + "30",
    },
    footerText: {
      fontSize: 8,
      color: "#666",
      marginTop: 2,
    },
    warrantyBox: {
      borderWidth: 1,
      borderColor: accent + "20",
      backgroundColor: accent + "08",
      padding: 10,
      borderRadius: 4,
      marginTop: 10,
    },
    warrantyText: {
      fontSize: 8,
      color: "#444",
      lineHeight: 1.6,
    },
    qr: {
      width: 80,
      height: 80,
      borderWidth: 1,
      borderColor: "#ddd",
      borderRadius: 4,
    },
    qrLabel: {
      fontSize: 7,
      color: "#999",
      marginTop: 2,
      textAlign: "center" as const,
    },
    companyInfo: {
      fontSize: 8,
      color: "#666",
      marginTop: 8,
    },
    badge: {
      fontSize: 7,
      color: accent,
      marginTop: 4,
    },
    customSection: {
      borderWidth: 1,
      borderColor: accent + "20",
      padding: 10,
      borderRadius: 4,
      marginTop: 8,
    },
  });
}

type TemplateSchema = {
  version: number;
  sections: Array<{
    title: string;
    fields: Array<{ key: string; label: string; type: string }>;
  }>;
};

function normValue(v: any): string | null {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) {
    const s = v.map((x) => String(x)).map((s) => s.trim()).filter(Boolean).join(", ");
    return s || null;
  }
  const s = String(v).trim();
  return s ? s : null;
}

function buildPresetLines(schema: TemplateSchema | null, values: Record<string, any> | null) {
  if (!schema || !values) return [];
  const lines: Array<{ section: string; label: string; value: string }> = [];
  for (const sec of schema.sections) {
    for (const f of sec.fields) {
      const v = values[f.key];
      if (f.type === "checkbox") {
        if (v) lines.push({ section: sec.title, label: f.label, value: "\u2713" });
        continue;
      }
      const s = normValue(v);
      if (!s) continue;
      lines.push({ section: sec.title, label: f.label, value: s });
    }
  }
  return lines;
}

/**
 * ブランドカスタム証明書PDFを生成する
 */
export async function renderBrandedCertificatePdf(
  row: CertRow,
  publicUrl: string,
  config: TemplateConfig,
) {
  const s = buildStyles(config);

  const preset = row.content_preset_json ?? {};
  const schema: TemplateSchema | null = (preset.schema_snapshot as any) ?? null;
  const values: Record<string, any> | null = (preset.values as any) ?? null;
  const vehicle = row.vehicle_info_json ?? {};
  const model = String(vehicle.model ?? "").trim();
  const plate = String(vehicle.plate ?? vehicle.plate_display ?? "").trim();
  const presetLines = buildPresetLines(schema, values);

  // ロゴ
  let logoUrl: string | null = null;
  try {
    if (config.branding.logo_asset_id) {
      // template_assets から storage_path を引いて signed URL を生成
      // ここでは logo_asset_path として扱う
      logoUrl = await createSignedAssetUrl(`template-logos/${config.branding.logo_asset_id}`, 3600);
    } else if (row.logo_asset_path) {
      logoUrl = await createSignedAssetUrl(row.logo_asset_path, 3600);
    }
  } catch {
    logoUrl = null;
  }

  // QRコード
  const qrDataUrl = await QRCode.toDataURL(publicUrl, { margin: 1, width: 240 });

  // メンテナンスQR
  let maintenanceQrDataUrl: string | null = null;
  if (config.footer?.show_maintenance_qr && config.footer?.maintenance_url) {
    try {
      maintenanceQrDataUrl = await QRCode.toDataURL(config.footer.maintenance_url, { margin: 1, width: 200 });
    } catch {
      maintenanceQrDataUrl = null;
    }
  }

  const headerConfig = config.header ?? { title: "施工証明書", show_issue_date: true, show_certificate_no: true };
  const logoPosition = config.branding.logo_position ?? "top-left";
  const logoHeight = config.branding.logo_max_height ?? 40;

  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ---- Header ---- */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <View style={s.titleRow}>
              {logoUrl && logoPosition === "top-left" && (
                <Image src={logoUrl} style={{ height: logoHeight, maxWidth: 160 }} />
              )}
              <Text style={s.title}>{headerConfig.title ?? "施工証明書"}</Text>
            </View>
            {headerConfig.subtitle && <Text style={s.subtitle}>{headerConfig.subtitle}</Text>}
            {headerConfig.show_certificate_no !== false && (
              <Text style={s.meta}>証明書ID: {row.public_id}</Text>
            )}
            {headerConfig.show_issue_date !== false && (
              <Text style={s.meta}>発行日: {new Date(row.created_at).toLocaleDateString("ja-JP")}</Text>
            )}
          </View>
          <View style={{ alignItems: "center" }}>
            {logoUrl && logoPosition === "top-right" && (
              <Image src={logoUrl} style={{ height: logoHeight, maxWidth: 160, marginBottom: 6 }} />
            )}
            <Image src={qrDataUrl} style={s.qr} />
            <Text style={s.qrLabel}>QRで確認</Text>
          </View>
        </View>

        {/* ---- Center logo ---- */}
        {logoUrl && logoPosition === "top-center" && (
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <Image src={logoUrl} style={{ height: logoHeight, maxWidth: 200 }} />
          </View>
        )}

        {/* ---- Customer ---- */}
        <View style={s.box}>
          <Text style={s.label}>お客様名</Text>
          <Text style={s.value}>{row.customer_name}</Text>
        </View>

        {/* ---- Vehicle ---- */}
        {(model || plate) && (
          <View style={s.box}>
            <Text style={s.boxTitle}>車両情報</Text>
            {model && (
              <View style={s.itemRow}>
                <Text style={s.itemLabel}>車種</Text>
                <Text style={s.itemValue}>{model}</Text>
              </View>
            )}
            {plate && (
              <View style={s.itemRow}>
                <Text style={s.itemLabel}>ナンバー</Text>
                <Text style={s.itemValue}>{plate}</Text>
              </View>
            )}
          </View>
        )}

        {/* ---- Preset fields ---- */}
        {presetLines.length > 0 && (
          <View style={s.box}>
            <Text style={s.boxTitle}>施工内容</Text>
            {presetLines.map((it, idx) => (
              <View key={idx} style={s.itemRow}>
                <Text style={s.itemLabel}>[{it.section}] {it.label}</Text>
                <Text style={s.itemValue}>{it.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ---- Free text ---- */}
        {row.content_free_text && (
          <View style={s.box}>
            <Text style={s.label}>施工内容（自由記述）</Text>
            <Text style={{ marginTop: 4 }}>{row.content_free_text}</Text>
          </View>
        )}

        {/* ---- Validity ---- */}
        <View style={s.box}>
          <Text style={s.label}>有効条件</Text>
          <Text style={s.value}>{row.expiry_type ?? ""}: {row.expiry_value ?? ""}</Text>
        </View>

        {/* ---- Custom sections (B only) ---- */}
        {config.body?.custom_sections?.map((sec, idx) => (
          <View key={idx} style={s.customSection}>
            <Text style={s.boxTitle}>{sec.title}</Text>
            <Text style={{ fontSize: 9 }}>{sec.content}</Text>
          </View>
        ))}

        {/* ---- Warranty / Notice ---- */}
        {(config.footer?.warranty_text || config.footer?.notice_text) && (
          <View style={s.warrantyBox}>
            {config.footer?.warranty_text && (
              <Text style={s.warrantyText}>{config.footer.warranty_text}</Text>
            )}
            {config.footer?.notice_text && (
              <Text style={[s.warrantyText, { marginTop: 4 }]}>
                {config.footer.notice_text}
              </Text>
            )}
          </View>
        )}

        {/* ---- Footer ---- */}
        <View style={s.footer}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              {/* Company info */}
              <Text style={s.companyInfo}>{config.branding.company_name}</Text>
              {config.branding.company_address && (
                <Text style={s.companyInfo}>{config.branding.company_address}</Text>
              )}
              {config.branding.company_phone && (
                <Text style={s.companyInfo}>TEL: {config.branding.company_phone}</Text>
              )}
              {config.branding.company_url && (
                <Text style={s.companyInfo}>{config.branding.company_url}</Text>
              )}

              {/* Maintenance URL */}
              {config.footer?.maintenance_url && (
                <Text style={[s.companyInfo, { marginTop: 6 }]}>
                  {config.footer.maintenance_label ?? "メンテナンス情報"}: {config.footer.maintenance_url}
                </Text>
              )}

              {/* Public URL */}
              <Text style={s.footerText}>証明書URL: {publicUrl}</Text>

              {/* CARTRUST badge */}
              {config.footer?.show_cartrust_badge !== false && (
                <Text style={s.badge}>Powered by CARTRUST</Text>
              )}
            </View>

            {/* Maintenance QR */}
            {maintenanceQrDataUrl && (
              <View style={{ alignItems: "center", marginLeft: 12 }}>
                <Image src={maintenanceQrDataUrl} style={{ width: 60, height: 60 }} />
                <Text style={s.qrLabel}>{config.footer?.maintenance_label ?? "メンテナンス"}</Text>
              </View>
            )}
          </View>
        </View>
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}
