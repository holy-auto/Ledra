import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";

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
import { createSignedAssetUrl } from "@/lib/signedUrl";
import QRCode from "qrcode";
import { getPanelLabel, getCoverageLabel, getFilmTypeLabel } from "@/lib/ppf/constants";
import { getWorkTypeLabel } from "@/lib/maintenance/constants";
import { getRepairTypeLabel, getRepairPanelLabel, getPaintTypeLabel, getRepairMethodLabel } from "@/lib/bodyRepair/constants";

type FieldType = "text" | "textarea" | "number" | "date" | "select" | "multiselect" | "checkbox";

type TemplateSchema = {
  version: number;
  sections: Array<{
    title: string;
    fields: Array<{ key: string; label: string; type: FieldType }>;
  }>;
};

export type CertRow = {
  public_id: string;
  tenant_custom_domain?: string | null;
  customer_name: string;
  /* eslint-disable @typescript-eslint/no-explicit-any -- DB JSON columns */
  vehicle_info_json: Record<string, any>;
  content_free_text: string | null;
  content_preset_json: Record<string, any>;
  coating_products_json?: Record<string, any>[] | null;
  ppf_coverage_json?: Record<string, any>[] | null;
  maintenance_json?: Record<string, any> | null;
  body_repair_json?: Record<string, any> | null;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  service_type?: string | null;
  expiry_type: string | null;
  expiry_value: string | null;
  warranty_period_end?: string | null;
  warranty_exclusions?: string | null;
  logo_asset_path: string | null;
  created_at: string;
  current_version?: number | null;
};

/** 1 枚の施工画像に対するオンチェーンアンカー情報 */
export type AnchorInfo = {
  /** SHA-256 ハッシュ (64 桁の16進) */
  sha256: string | null;
  /** Polygon トランザクションハッシュ (0x...) */
  polygon_tx_hash: string | null;
  /** "polygon" | "amoy" のどちら */
  polygon_network: "polygon" | "amoy" | null;
};

/** PDF 本体に QR を載せる最大枚数。これ以上は "+N more" 表記にする */
const MAX_ANCHOR_QR = 4;

const colors = {
  bg: "#060a12",
  bgCard: "#0b111c",
  bgCardAlt: "#0d0b1e",
  bgHash: "#140b2a",
  border: "#1a2233",
  borderStrong: "#2a3451",
  text: "#ffffff",
  muted: "#c8cfdd",
  dim: "#8e99b0",
  faint: "#5f6a81",
  blue: "#60a5fa",
  violet: "#a78bfa",
  success: "#10b981",
  danger: "#f87171",
} as const;

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.bg,
    color: colors.text,
    fontSize: 10,
    fontFamily: "NotoSansJP",
    padding: 32,
    paddingBottom: 52,
  },
  // Top row with brand + badge
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  brand: {
    fontSize: 15,
    fontWeight: 700,
    color: colors.text,
    letterSpacing: 1,
  },
  brandSub: {
    fontSize: 7,
    color: colors.faint,
    letterSpacing: 2,
    marginTop: 2,
    textTransform: "uppercase",
  },
  badge: {
    borderWidth: 1,
    borderColor: "#2f5a8f",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    fontSize: 8,
    color: colors.blue,
    letterSpacing: 2,
    backgroundColor: "#0d1a2a",
  },
  // Hero
  heroBar: {
    width: 48,
    height: 3,
    backgroundColor: colors.blue,
    marginBottom: 8,
  },
  heroEyebrow: {
    fontSize: 7.5,
    color: colors.dim,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: colors.text,
    lineHeight: 1.15,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 8.5,
    color: colors.faint,
    letterSpacing: 4,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  // Cert number block
  certMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  certNumberLabel: {
    fontSize: 7.5,
    color: colors.faint,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  certNumber: {
    fontSize: 18,
    fontWeight: 700,
    color: colors.violet,
    letterSpacing: 1,
    marginTop: 3,
  },
  certDateLabel: {
    fontSize: 7.5,
    color: colors.faint,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  certDate: {
    fontSize: 11,
    color: colors.text,
    fontWeight: 700,
    marginTop: 3,
  },
  // Section (replaces card — no border/bg, just a thin top divider)
  section: {
    paddingTop: 10,
    paddingBottom: 2,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    marginBottom: 4,
  },
  sectionFirst: {
    borderTopWidth: 0,
    paddingTop: 4,
  },
  cardEyebrow: {
    fontSize: 7.5,
    color: colors.dim,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: colors.text,
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 9.5,
    color: colors.muted,
    lineHeight: 1.55,
  },
  // Label/value row
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: 4,
    paddingBottom: 4,
    borderTopWidth: 0.5,
    borderTopColor: "#141d2e",
  },
  rowFirst: { borderTopWidth: 0 },
  rowLabel: {
    fontSize: 9,
    color: colors.dim,
    width: 96,
  },
  rowValue: {
    flex: 1,
    fontSize: 10,
    color: colors.text,
    fontWeight: 700,
  },
  // Section label
  sectionLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: colors.blue,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 8,
  },
  // QR (inside Customer · Vehicle section)
  qrInner: {
    padding: 5,
    borderRadius: 4,
    backgroundColor: "#ffffff",
  },
  qr: {
    width: 72,
    height: 72,
  },
  qrCaption: {
    fontSize: 7,
    color: colors.dim,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 4,
  },
  // Anchor QR
  anchorBlock: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#141d2e",
  },
  anchorQrOuter: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: "#ffffff",
  },
  anchorQr: {
    width: 60,
    height: 60,
  },
  anchorMeta: {
    flex: 1,
  },
  hashText: {
    fontSize: 8.5,
    color: colors.violet,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  // Tagline
  tagline: {
    fontSize: 10,
    fontWeight: 700,
    color: colors.violet,
    letterSpacing: 1,
    textAlign: "center",
    marginTop: 14,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  footerLeft: {
    fontSize: 7.5,
    color: colors.faint,
    letterSpacing: 1,
  },
  footerRight: {
    fontSize: 7.5,
    color: colors.dim,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  // Reissue warning
  reissue: {
    fontSize: 8,
    color: colors.danger,
    marginTop: 3,
    letterSpacing: 1,
  },
  // Bullet list
  bullet: {
    fontSize: 9,
    color: colors.muted,
    lineHeight: 1.55,
    marginBottom: 2,
  },
  // Page 2 title
  page2Eyebrow: {
    fontSize: 8,
    color: colors.dim,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  page2Title: {
    fontSize: 18,
    fontWeight: 700,
    color: colors.text,
    marginBottom: 4,
  },
  page2Sub: {
    fontSize: 9,
    color: colors.faint,
    letterSpacing: 2,
    marginBottom: 16,
  },
});

function buildExplorerUrl(txHash: string, network: "polygon" | "amoy"): string {
  const base = network === "amoy" ? "https://amoy.polygonscan.com" : "https://polygonscan.com";
  return `${base}/tx/${txHash}`;
}

/**
 * 施工画像ごとの anchor 情報から、PDF に埋め込む QR のセットを生成する。
 * anchored & tx_hash が揃っているものだけを対象とし、上限は MAX_ANCHOR_QR。
 */
async function buildAnchorQrs(
  anchors: AnchorInfo[] | undefined,
): Promise<Array<{ qrDataUrl: string; txHash: string; network: "polygon" | "amoy"; shaPrefix: string | null }>> {
  if (!anchors || anchors.length === 0) return [];
  const valid = anchors.filter(
    (a): a is AnchorInfo & { polygon_tx_hash: string; polygon_network: "polygon" | "amoy" } =>
      typeof a.polygon_tx_hash === "string" &&
      a.polygon_tx_hash.length > 0 &&
      (a.polygon_network === "polygon" || a.polygon_network === "amoy"),
  );
  const capped = valid.slice(0, MAX_ANCHOR_QR);
  return Promise.all(
    capped.map(async (a) => {
      const explorerUrl = buildExplorerUrl(a.polygon_tx_hash, a.polygon_network);
      const qrDataUrl = await QRCode.toDataURL(explorerUrl, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 200,
      });
      return {
        qrDataUrl,
        txHash: a.polygon_tx_hash,
        network: a.polygon_network,
        shaPrefix: a.sha256 ? a.sha256.slice(0, 12) : null,
      };
    }),
  );
}

function normValue(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) {
    const s = v.map((x) => String(x)).map((s) => s.trim()).filter(Boolean).join(", ");
    return s || null;
  }
  const s = String(v).trim();
  return s ? s : null;
}

function buildPublicOrigin(cert: { tenant_custom_domain?: string | null }, fallbackOrigin?: string) {
  if (cert.tenant_custom_domain) return `https://${cert.tenant_custom_domain}`;
  if (fallbackOrigin) return fallbackOrigin;
  return "http://localhost:3000";
}

async function makeQrDataUrl(publicUrl: string): Promise<string> {
  // PNG data URL（@react-pdf/renderer で安定）
  return await QRCode.toDataURL(publicUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 300,
  });
}

function buildPresetLines(schema: TemplateSchema | null, values: Record<string, any> | null) {
  if (!schema || !values) return [];
  const lines: Array<{ section: string; label: string; value: string }> = [];
  for (const sec of schema.sections) {
    for (const f of sec.fields) {
      const v = values[f.key];
      if (f.type === "checkbox") {
        if (v) lines.push({ section: sec.title, label: f.label, value: "✓" });
        continue;
      }
      const s = normValue(v);
      if (!s) continue;
      lines.push({ section: sec.title, label: f.label, value: s });
    }
  }
  return lines;
}

export async function renderCertificatePdf(
  row: CertRow,
  publicUrl: string,
  anchors?: AnchorInfo[],
) {
  const preset = row.content_preset_json ?? {};
  const schema: TemplateSchema | null = (preset.schema_snapshot as any) ?? null;
  const values: Record<string, any> | null = (preset.values as any) ?? null;

  const vehicle = row.vehicle_info_json ?? {};
  const model = String(vehicle.model ?? "").trim();
  const plate = String(vehicle.plate ?? "").trim();
  const color = String(vehicle.color ?? "").trim();
  const isPpf = row.service_type === "ppf";
  const isMaintenance = row.service_type === "maintenance";
  const isBodyRepair = row.service_type === "body_repair";
  const ppfCoverage: Record<string, any>[] = Array.isArray(row.ppf_coverage_json) ? row.ppf_coverage_json : [];
  const maintenanceData: Record<string, any> = (typeof row.maintenance_json === "object" && row.maintenance_json) ? row.maintenance_json : {};
  const bodyRepairData: Record<string, any> = (typeof row.body_repair_json === "object" && row.body_repair_json) ? row.body_repair_json : {};

  const presetLines = buildPresetLines(schema, values);

  let logoUrl: string | null = null;
  try {
    logoUrl = row.logo_asset_path ? await createSignedAssetUrl(row.logo_asset_path, 3600) : null;
  } catch {
    logoUrl = null;
  }

  const qrDataUrl = await QRCode.toDataURL(publicUrl, { margin: 1, width: 220 });
  const anchorQrs = await buildAnchorQrs(anchors);
  const totalAnchored = (anchors ?? []).filter(
    (a) => typeof a.polygon_tx_hash === "string" && a.polygon_tx_hash.length > 0,
  ).length;
  const moreAnchorCount = Math.max(0, totalAnchored - anchorQrs.length);
  const certTitle = isPpf ? "PPF施工証明書"
    : isMaintenance ? "整備証明書"
    : isBodyRepair ? "鈑金塗装証明書"
    : "施工証明書";
  const productsTitle = isPpf ? "使用フィルム" : "コーティング剤";

  const issueDate = new Date(row.created_at).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const serviceStatement = isPpf
    ? "本証明書は、下記車両に対してペイントプロテクションフィルム (PPF) の施工が完了した事実を、Polygon ブロックチェーンに刻印された改ざん不可能な記録として証明するものです。"
    : isMaintenance
      ? "本証明書は、下記車両に対して整備作業が実施された事実を、Polygon ブロックチェーンに刻印された改ざん不可能な記録として証明するものです。"
      : isBodyRepair
        ? "本証明書は、下記車両に対して鈑金塗装作業が実施された事実を、Polygon ブロックチェーンに刻印された改ざん不可能な記録として証明するものです。"
        : "本証明書は、下記車両に対して施工作業が完了した事実を、Polygon ブロックチェーンに刻印された改ざん不可能な記録として証明するものです。";

  const networkLabel = (network: "polygon" | "amoy") =>
    network === "amoy" ? "Polygon Amoy testnet" : "Polygon mainnet";

  const doc = (
    <Document>
      {/* ── ページ1: 証明書本体 ── */}
      <Page size="A4" style={styles.page}>
        {/* Top row: brand + badge */}
        <View style={styles.topRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {logoUrl ? <Image src={logoUrl} style={{ height: 22, width: 96 }} /> : null}
            <View>
              <Text style={styles.brand}>Ledra</Text>
              <Text style={styles.brandSub}>Construction Record · Verified</Text>
            </View>
          </View>
          <Text style={styles.badge}>CERTIFICATE · {(row.current_version ?? 1) > 1 ? `v${row.current_version}` : "v1"}</Text>
        </View>

        {/* Hero */}
        <View style={styles.heroBar} />
        <Text style={styles.heroEyebrow}>{certTitle.toUpperCase()}</Text>
        <Text style={styles.heroTitle}>{certTitle}</Text>
        <Text style={styles.heroSub}>Certificate of Construction Record</Text>

        {/* Cert metadata */}
        <View style={styles.certMeta}>
          <View>
            <Text style={styles.certNumberLabel}>Certificate No.</Text>
            <Text style={styles.certNumber}>{row.public_id}</Text>
            {(row.current_version ?? 1) > 1 && (
              <Text style={styles.reissue}>再発行版 (第{row.current_version}版)</Text>
            )}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.certDateLabel}>Issued</Text>
            <Text style={styles.certDate}>{issueDate}</Text>
          </View>
        </View>

        {/* Declaration */}
        <View style={[styles.section, styles.sectionFirst]}>
          <Text style={styles.cardEyebrow}>Declaration</Text>
          <Text style={styles.cardBody}>{serviceStatement}</Text>
        </View>

        {/* Customer + Vehicle (QR on the right) */}
        <View style={styles.section}>
          <Text style={styles.cardEyebrow}>Customer · Vehicle</Text>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
            <View style={{ flex: 1 }}>
              <View style={[styles.row, styles.rowFirst]}>
                <Text style={styles.rowLabel}>お客様名</Text>
                <Text style={styles.rowValue}>{row.customer_name}</Text>
              </View>
              {model ? (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>車種</Text>
                  <Text style={styles.rowValue}>{model}</Text>
                </View>
              ) : null}
              {plate ? (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>ナンバー</Text>
                  <Text style={styles.rowValue}>{plate}</Text>
                </View>
              ) : null}
              {color ? (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>ボディカラー</Text>
                  <Text style={styles.rowValue}>{color}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ alignItems: "center", paddingTop: 4 }}>
              <View style={styles.qrInner}>
                <Image src={qrDataUrl} style={styles.qr} />
              </View>
              <Text style={styles.qrCaption}>Scan to verify</Text>
            </View>
          </View>
        </View>

        {/* 使用フィルム / コーティング剤 */}
        {Array.isArray(row.coating_products_json) && row.coating_products_json.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.cardEyebrow}>{productsTitle}</Text>
            {row.coating_products_json.map((cp: Record<string, any>, idx: number) => (
              <View key={idx} style={[styles.row, idx === 0 && styles.rowFirst]}>
                <Text style={styles.rowLabel}>{cp.location || "-"}</Text>
                <Text style={styles.rowValue}>
                  {[cp.brand_name, cp.product_name, cp.film_type ? getFilmTypeLabel(cp.film_type) : null]
                    .filter(Boolean)
                    .join(" / ") || "-"}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* PPF施工範囲 */}
        {isPpf && ppfCoverage.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.cardEyebrow}>施工範囲 · PPF Coverage</Text>
            {ppfCoverage.map((entry: Record<string, any>, idx: number) => (
              <View key={idx} style={[styles.row, idx === 0 && styles.rowFirst]}>
                <Text style={styles.rowLabel}>{getPanelLabel(entry.panel)}</Text>
                <Text style={styles.rowValue}>
                  {getCoverageLabel(entry.coverage)}
                  {entry.partial_note ? ` — ${entry.partial_note}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* 整備内容 */}
        {isMaintenance && Object.keys(maintenanceData).length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.cardEyebrow}>整備内容 · Maintenance</Text>
            {Array.isArray(maintenanceData.work_types) && maintenanceData.work_types.length > 0 ? (
              <View style={[styles.row, styles.rowFirst]}>
                <Text style={styles.rowLabel}>作業種別</Text>
                <Text style={styles.rowValue}>
                  {maintenanceData.work_types.map((wt: string) => getWorkTypeLabel(wt)).join("、")}
                </Text>
              </View>
            ) : null}
            {maintenanceData.mileage ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>走行距離</Text>
                <Text style={styles.rowValue}>{maintenanceData.mileage} km</Text>
              </View>
            ) : null}
            {maintenanceData.parts_replaced ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>交換部品</Text>
                <Text style={styles.rowValue}>{maintenanceData.parts_replaced}</Text>
              </View>
            ) : null}
            {maintenanceData.next_service_date ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>次回点検日</Text>
                <Text style={styles.rowValue}>{maintenanceData.next_service_date}</Text>
              </View>
            ) : null}
            {maintenanceData.findings ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>点検結果・所見</Text>
                <Text style={styles.rowValue}>{maintenanceData.findings}</Text>
              </View>
            ) : null}
            {maintenanceData.mechanic_name ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>担当整備士</Text>
                <Text style={styles.rowValue}>{maintenanceData.mechanic_name}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* 鈑金塗装内容 */}
        {isBodyRepair && Object.keys(bodyRepairData).length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.cardEyebrow}>鈑金塗装内容 · Body Repair</Text>
            {bodyRepairData.repair_type ? (
              <View style={[styles.row, styles.rowFirst]}>
                <Text style={styles.rowLabel}>修理種別</Text>
                <Text style={styles.rowValue}>{getRepairTypeLabel(bodyRepairData.repair_type)}</Text>
              </View>
            ) : null}
            {Array.isArray(bodyRepairData.affected_panels) && bodyRepairData.affected_panels.length > 0 ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>修理箇所</Text>
                <Text style={styles.rowValue}>
                  {bodyRepairData.affected_panels.map((p: string) => getRepairPanelLabel(p)).join("、")}
                </Text>
              </View>
            ) : null}
            {bodyRepairData.paint_color_code ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>塗装色・カラーコード</Text>
                <Text style={styles.rowValue}>{bodyRepairData.paint_color_code}</Text>
              </View>
            ) : null}
            {bodyRepairData.paint_type ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>塗装タイプ</Text>
                <Text style={styles.rowValue}>{getPaintTypeLabel(bodyRepairData.paint_type)}</Text>
              </View>
            ) : null}
            {Array.isArray(bodyRepairData.repair_methods) && bodyRepairData.repair_methods.length > 0 ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>修理方法</Text>
                <Text style={styles.rowValue}>
                  {bodyRepairData.repair_methods.map((m: string) => getRepairMethodLabel(m)).join("、")}
                </Text>
              </View>
            ) : null}
            {bodyRepairData.before_notes ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>修理前の状態</Text>
                <Text style={styles.rowValue}>{bodyRepairData.before_notes}</Text>
              </View>
            ) : null}
            {bodyRepairData.after_notes ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>修理後の状態</Text>
                <Text style={styles.rowValue}>{bodyRepairData.after_notes}</Text>
              </View>
            ) : null}
            {bodyRepairData.warranty_info ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>修理保証</Text>
                <Text style={styles.rowValue}>{bodyRepairData.warranty_info}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Preset (generic schema) */}
        {presetLines.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.cardEyebrow}>施工内容 · Service Details</Text>
            {presetLines.map((it, idx) => (
              <View key={idx} style={[styles.row, idx === 0 && styles.rowFirst]}>
                <Text style={styles.rowLabel}>[{it.section}] {it.label}</Text>
                <Text style={styles.rowValue}>{it.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Free-text */}
        {row.content_free_text ? (
          <View style={styles.section}>
            <Text style={styles.cardEyebrow}>施工内容（自由記述）</Text>
            <Text style={styles.cardBody}>{row.content_free_text}</Text>
          </View>
        ) : null}

        {/* Validity */}
        <View style={styles.section}>
          <Text style={styles.cardEyebrow}>有効条件 · Validity</Text>
          <Text style={styles.cardBody}>{[row.expiry_type, row.expiry_value].filter(Boolean).join(": ") || "—"}</Text>
        </View>

        <Text style={styles.tagline}>記録を、業界の共通言語にする。</Text>

        <View style={styles.footer} fixed>
          <Text style={styles.footerLeft}>{publicUrl}</Text>
          <Text style={styles.footerRight}>Powered by Ledra</Text>
        </View>
      </Page>

      {/* ── ページ2: 改ざん防止・保証・注意事項（該当条件のいずれかで表示） ── */}
      {(anchorQrs.length > 0 || isPpf || isMaintenance || isBodyRepair) && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.page2Eyebrow}>Certificate No. {row.public_id}</Text>
          <Text style={styles.page2Title}>{certTitle}</Text>
          <Text style={styles.page2Sub}>Technical Record · Warranty · Notice</Text>

          {/* Polygon anchoring — 改ざん防止の根拠 */}
          {anchorQrs.length > 0 && (
            <View style={[styles.section, styles.sectionFirst]} wrap={false}>
              <Text style={styles.cardEyebrow}>Tamper Proof · Polygon Anchoring</Text>
              <Text style={[styles.cardBody, { marginBottom: 10 }]}>
                施工画像の SHA-256 ハッシュを Polygon ブロックチェーンに刻印しています。
                各 QR を読み取ると Polygonscan 上で改ざん防止の証跡を独立して検証できます。
              </Text>
              {anchorQrs.map((a, idx) => (
                <View key={idx} style={styles.anchorBlock}>
                  <View style={styles.anchorQrOuter}>
                    <Image src={a.qrDataUrl} style={styles.anchorQr} />
                  </View>
                  <View style={styles.anchorMeta}>
                    <Text style={{ fontSize: 9.5, color: colors.text, fontWeight: 700 }}>
                      画像 #{idx + 1}
                    </Text>
                    <Text style={{ fontSize: 8.5, color: colors.dim, marginTop: 2 }}>
                      {networkLabel(a.network)}
                    </Text>
                    {a.shaPrefix ? (
                      <Text style={styles.hashText}>SHA-256: {a.shaPrefix}…</Text>
                    ) : null}
                    <Text style={[styles.hashText, { color: colors.blue }]}>
                      TX: {a.txHash.slice(0, 16)}…{a.txHash.slice(-8)}
                    </Text>
                  </View>
                </View>
              ))}
              {moreAnchorCount > 0 ? (
                <Text style={[styles.cardBody, { marginTop: 8, fontSize: 9, color: colors.dim }]}>
                  ほか {moreAnchorCount} 枚もオンチェーン記録済み（全 {totalAnchored} 枚）
                </Text>
              ) : null}
            </View>
          )}

          {/* 保証情報 */}
          {row.warranty_period_end && (
            <View style={styles.section}>
              <Text style={styles.cardEyebrow}>保証情報 · Warranty</Text>
              <View style={[styles.row, styles.rowFirst]}>
                <Text style={styles.rowLabel}>保証期間終了日</Text>
                <Text style={styles.rowValue}>{row.warranty_period_end}</Text>
              </View>
            </View>
          )}

          {/* 鈑金塗装の修理保証内容 */}
          {isBodyRepair && bodyRepairData.warranty_info && (
            <View style={styles.section}>
              <Text style={styles.cardEyebrow}>修理保証内容 · Repair Warranty</Text>
              <Text style={styles.cardBody}>{bodyRepairData.warranty_info}</Text>
            </View>
          )}

          {/* 保証対象外 */}
          {row.warranty_exclusions && (
            <View style={styles.section}>
              <Text style={styles.cardEyebrow}>保証対象外事項 · Exclusions</Text>
              <Text style={styles.cardBody}>{row.warranty_exclusions}</Text>
            </View>
          )}

          {/* サービス別 注意事項 */}
          {isPpf && (
            <View style={styles.section}>
              <Text style={styles.cardEyebrow}>フィルムのお取り扱い · Care</Text>
              {[
                "施工後 48 時間は洗車およびフィルム端部への接触をお控えください。",
                "洗車は中性洗剤を使用した手洗いを推奨します。",
                "高圧洗浄機をご使用の際は、フィルム端部から 30cm 以上離してください。",
                "ワックスやコンパウンドをフィルム面に使用しないでください。",
                "フィルムの端部が浮いた場合は、ご自身で処置せず施工店にご連絡ください。",
              ].map((line, i) => (
                <Text key={i} style={styles.bullet}>
                  ・{line}
                </Text>
              ))}
            </View>
          )}

          {isMaintenance && (
            <View style={styles.section}>
              <Text style={styles.cardEyebrow}>整備後のご注意 · Aftercare</Text>
              {[
                "整備後は慣らし運転を推奨します。急加速・急ブレーキはお控えください。",
                "オイル交換後は 100km 走行後にオイル量を再確認してください。",
                "異音、振動、警告灯の点灯等の異常が発生した場合は速やかにご連絡ください。",
                "定期的な点検・メンテナンスが車両の長寿命化につながります。",
                "次回点検日が記載されている場合は、期日までの点検をお勧めします。",
              ].map((line, i) => (
                <Text key={i} style={styles.bullet}>
                  ・{line}
                </Text>
              ))}
            </View>
          )}

          {isBodyRepair && (
            <View style={styles.section}>
              <Text style={styles.cardEyebrow}>塗装後のご注意 · Aftercare</Text>
              {[
                "塗装後 1 週間は洗車をお控えください。",
                "塗装後 1 ヶ月間はワックスがけをお控えください。",
                "高圧洗浄機のご使用は塗装面から 30cm 以上離してください。",
                "鳥の糞、樹液等の付着物は速やかに除去してください。",
                "塗装面の異常（剥がれ、膨れ、変色等）を発見した場合は速やかにご連絡ください。",
                "研磨剤入りのワックスやコンパウンドの使用はお控えください。",
              ].map((line, i) => (
                <Text key={i} style={styles.bullet}>
                  ・{line}
                </Text>
              ))}
            </View>
          )}

          {/* 免責事項 — 共通 */}
          {(isPpf || isMaintenance || isBodyRepair) && (
            <View style={styles.section}>
              <Text style={styles.cardEyebrow}>免責事項 · Disclaimer</Text>
              <Text style={[styles.cardBody, { marginBottom: 6 }]}>
                本証明書は作業が実施された事実を証明するものであり、車両の状態や性能を保証するものではありません。
                保証の適用にあたっては、当店による現車確認が必要となる場合があります。
              </Text>
              <Text style={[styles.cardBody, { marginBottom: 4, color: colors.dim }]}>
                以下の事項は保証の対象外となります:
              </Text>
              {(isPpf
                ? [
                    "飛び石、事故その他の外的要因による物理的損傷",
                    "不適切なメンテナンスに起因する劣化・損傷",
                    "お客様ご自身による剥離、補修、改変",
                    "当店以外での施工、修理、改造後に生じた不具合",
                    "自然災害（台風、雹、洪水等）による損傷",
                    "フィルムの経年による通常の劣化",
                  ]
                : isMaintenance
                  ? [
                      "整備箇所以外の部品・装置の不具合",
                      "お客様の使用方法に起因する故障・損傷",
                      "事故、災害等の外的要因による損傷",
                      "当店以外での整備・修理・改造後に生じた不具合",
                      "消耗品の通常摩耗",
                    ]
                  : [
                      "飛び石、事故その他の外的要因による損傷",
                      "不適切なメンテナンスに起因する劣化・損傷",
                      "当店以外での施工、修理、改造後に生じた不具合",
                      "自然災害（台風、雹、洪水等）による損傷",
                      "経年による通常の劣化・退色",
                    ]
              ).map((line, i) => (
                <Text key={i} style={styles.bullet}>
                  ・{line}
                </Text>
              ))}
            </View>
          )}

          {/* オンライン照会 */}
          <View style={styles.section}>
            <Text style={styles.cardEyebrow}>オンライン照会 · Verify Online</Text>
            <Text style={styles.cardBody}>
              本証明書に記載の QR コードをスマートフォンで読み取ると、
              Ledra 認証プラットフォーム上で本証明書の最新情報をリアルタイムに確認できます。
            </Text>
          </View>

          <View style={styles.footer} fixed>
            <Text style={styles.footerLeft}>{publicUrl}</Text>
            <Text style={styles.footerRight}>Powered by Ledra</Text>
          </View>
        </Page>
      )}
    </Document>
  );

  return await renderToBuffer(doc);
}