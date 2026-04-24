import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSignedAssetUrl } from "@/lib/signedUrl";
import QRCode from "qrcode";
import type { TemplateConfig } from "@/types/templateOption";
import type { CertRow } from "@/lib/pdfCertificate";
import { getPanelLabel, getCoverageLabel, getFilmTypeLabel } from "@/lib/ppf/constants";

const NOTO_SANS_JP = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-400-normal.ttf";
const NOTO_SANS_JP_BOLD = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-700-normal.ttf";
const NOTO_SERIF_JP = "https://cdn.jsdelivr.net/fontsource/fonts/noto-serif-jp@latest/japanese-400-normal.ttf";
const NOTO_SERIF_JP_BOLD = "https://cdn.jsdelivr.net/fontsource/fonts/noto-serif-jp@latest/japanese-700-normal.ttf";

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

  const borderWidth =
    config.style?.border_style === "none"
      ? 0
      : config.style?.border_style === "double"
        ? 2
        : config.style?.border_style === "elegant"
          ? 1.5
          : 1;

  const bgColor =
    config.style?.background_variant === "cream"
      ? "#faf8f5"
      : config.style?.background_variant === "light-gray"
        ? "#f5f5f7"
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
    const s = v
      .map((x) => String(x))
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ");
    return s || null;
  }
  const s = String(v).trim();
  return s ? s : null;
}

function buildPresetLines(schema: TemplateSchema | null, values: Record<string, unknown> | null) {
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
export async function renderBrandedCertificatePdf(row: CertRow, publicUrl: string, config: TemplateConfig) {
  const s = buildStyles(config);

  const preset = row.content_preset_json ?? {};
  // content_preset_json は DB JSON カラムで動的。TemplateSchema と
  // Record<string, unknown> に narrow する用途のみで cast する。
  const schema: TemplateSchema | null = (preset.schema_snapshot as unknown as TemplateSchema) ?? null;
  const values: Record<string, unknown> | null = (preset.values as Record<string, unknown>) ?? null;
  const vehicle = row.vehicle_info_json ?? {};
  const model = String(vehicle.model ?? "").trim();
  const plate = String(vehicle.plate ?? vehicle.plate_display ?? "").trim();
  const color = String(vehicle.color ?? "").trim();
  const isPpf = row.service_type === "ppf";
  const ppfCoverage: any[] = Array.isArray(row.ppf_coverage_json) ? row.ppf_coverage_json : [];
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
            {headerConfig.show_certificate_no !== false && <Text style={s.meta}>証明書ID: {row.public_id}</Text>}
            {headerConfig.show_issue_date !== false && (
              <Text style={s.meta}>発行日: {new Date(row.created_at).toLocaleDateString("ja-JP")}</Text>
            )}
            {(row.current_version ?? 1) > 1 && (
              <Text style={[s.meta, { color: "#c00" }]}>再発行版（第{row.current_version}版）</Text>
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
            {color && (
              <View style={s.itemRow}>
                <Text style={s.itemLabel}>ボディカラー</Text>
                <Text style={s.itemValue}>{color}</Text>
              </View>
            )}
          </View>
        )}

        {/* ---- PPF: Film info ---- */}
        {isPpf && Array.isArray(row.coating_products_json) && row.coating_products_json.length > 0 && (
          <View style={s.box}>
            <Text style={s.boxTitle}>使用フィルム</Text>
            {row.coating_products_json.map((cp: any, idx: number) => (
              <View key={idx} style={s.itemRow}>
                <Text style={s.itemLabel}>{cp.location || "-"}</Text>
                <Text style={s.itemValue}>
                  {[cp.brand_name, cp.product_name, cp.film_type ? getFilmTypeLabel(cp.film_type) : null]
                    .filter(Boolean)
                    .join(" / ") || "-"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ---- PPF: Coverage panels ---- */}
        {isPpf && ppfCoverage.length > 0 && (
          <View style={s.box}>
            <Text style={s.boxTitle}>施工範囲</Text>
            {ppfCoverage.map((entry: any, idx: number) => (
              <View key={idx} style={s.itemRow}>
                <Text style={s.itemLabel}>{getPanelLabel(entry.panel)}</Text>
                <Text style={s.itemValue}>
                  {getCoverageLabel(entry.coverage)}
                  {entry.partial_note ? ` — ${entry.partial_note}` : ""}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ---- Non-PPF: Coating products ---- */}
        {!isPpf && Array.isArray(row.coating_products_json) && row.coating_products_json.length > 0 && (
          <View style={s.box}>
            <Text style={s.boxTitle}>コーティング剤</Text>
            {row.coating_products_json.map((cp: any, idx: number) => (
              <View key={idx} style={s.itemRow}>
                <Text style={s.itemLabel}>{cp.location || "-"}</Text>
                <Text style={s.itemValue}>{[cp.brand_name, cp.product_name].filter(Boolean).join(" / ") || "-"}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ---- Preset fields ---- */}
        {presetLines.length > 0 && (
          <View style={s.box}>
            <Text style={s.boxTitle}>施工内容</Text>
            {presetLines.map((it, idx) => (
              <View key={idx} style={s.itemRow}>
                <Text style={s.itemLabel}>
                  [{it.section}] {it.label}
                </Text>
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
          <Text style={s.value}>
            {row.expiry_type ?? ""}: {row.expiry_value ?? ""}
          </Text>
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
            {config.footer?.warranty_text && <Text style={s.warrantyText}>{config.footer.warranty_text}</Text>}
            {config.footer?.notice_text && (
              <Text style={[s.warrantyText, { marginTop: 4 }]}>{config.footer.notice_text}</Text>
            )}
          </View>
        )}

        {/* ---- Footer ---- */}
        <View style={s.footer}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              {/* Company info */}
              <Text style={s.companyInfo}>{config.branding.company_name}</Text>
              {config.branding.company_address && <Text style={s.companyInfo}>{config.branding.company_address}</Text>}
              {config.branding.company_phone && <Text style={s.companyInfo}>TEL: {config.branding.company_phone}</Text>}
              {config.branding.company_url && <Text style={s.companyInfo}>{config.branding.company_url}</Text>}

              {/* Maintenance URL */}
              {config.footer?.maintenance_url && (
                <Text style={[s.companyInfo, { marginTop: 6 }]}>
                  {config.footer.maintenance_label ?? "メンテナンス情報"}: {config.footer.maintenance_url}
                </Text>
              )}

              {/* Public URL */}
              <Text style={s.footerText}>証明書URL: {publicUrl}</Text>

              {/* Ledra badge */}
              {config.footer?.show_ledra_badge !== false && <Text style={s.badge}>Powered by Ledra</Text>}
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

      {/* ── PPF Page 2: 保証・注意事項 ── */}
      {isPpf && (
        <Page size="A4" style={s.page}>
          <View>
            <Text style={s.title}>{headerConfig.title ?? "PPF施工証明書"} — 保証・注意事項</Text>
            <Text style={s.meta}>証明書番号: {row.public_id}</Text>
          </View>

          {row.warranty_period_end && (
            <View style={s.box}>
              <Text style={s.boxTitle}>保証情報</Text>
              <View style={s.itemRow}>
                <Text style={s.itemLabel}>保証期間終了日</Text>
                <Text style={s.itemValue}>{row.warranty_period_end}</Text>
              </View>
            </View>
          )}

          {row.warranty_exclusions && (
            <View style={s.box}>
              <Text style={s.boxTitle}>保証対象外事項</Text>
              <Text style={{ fontSize: 9, lineHeight: 1.6 }}>{row.warranty_exclusions}</Text>
            </View>
          )}

          <View style={s.box}>
            <Text style={s.boxTitle}>フィルムのお取り扱いについて</Text>
            <Text style={s.warrantyText}>
              {[
                "・施工後48時間は洗車およびフィルム端部への接触をお控えください。",
                "・洗車は中性洗剤を使用した手洗いを推奨します。",
                "・高圧洗浄機をご使用の際は、フィルム端部から30cm以上離してください。",
                "・ワックスやコンパウンドをフィルム面に使用しないでください。",
                "・フィルムの端部が浮いた場合は、ご自身で処置せず施工店にご連絡ください。",
              ].join("\n")}
            </Text>
          </View>

          <View style={s.box}>
            <Text style={s.boxTitle}>免責事項</Text>
            <Text style={s.warrantyText}>
              {[
                "本証明書は施工事実を証明するものであり、車両の状態や性能を保証するものではありません。",
                "以下の事項については保証の対象外となります。",
                "",
                "・飛び石、事故その他の外的要因による物理的損傷",
                "・不適切なメンテナンスに起因する劣化・損傷",
                "・お客様ご自身による剥離、補修、改変",
                "・当店以外での施工、修理、改造後に生じた不具合",
                "・自然災害（台風、雹、洪水等）による損傷",
                "・フィルムの経年による通常の劣化",
                "・車両の製造上の塗装不良に起因する問題",
                "",
                "保証の適用にあたっては、施工店による現車確認が必要となる場合があります。",
              ].join("\n")}
            </Text>
          </View>

          <View style={s.box}>
            <Text style={s.boxTitle}>オンライン照会について</Text>
            <Text style={s.warrantyText}>
              本証明書に記載のQRコードをスマートフォンで読み取ると、Ledra認証プラットフォーム上で本証明書の最新情報をリアルタイムに確認できます。
            </Text>
          </View>

          <View style={s.footer}>
            {config.footer?.show_ledra_badge !== false && <Text style={s.badge}>Powered by Ledra</Text>}
          </View>
        </Page>
      )}
    </Document>
  );

  return await renderToBuffer(doc);
}
