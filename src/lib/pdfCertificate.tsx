import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSignedAssetUrl } from "@/lib/signedUrl";
import QRCode from "qrcode";

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
  vehicle_info_json: any;
  content_free_text: string | null;
  content_preset_json: any;
  expiry_type: string | null;
  expiry_value: string | null;
  logo_asset_path: string | null;
  created_at: string;
};

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 18 },
  meta: { color: "#666", marginTop: 4 },
  box: { borderWidth: 1, borderColor: "#ddd", padding: 10, borderRadius: 6, marginTop: 10 },
  label: { color: "#666", fontSize: 9 },
  value: { fontSize: 12, marginTop: 2 },
  footer: { marginTop: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#ddd", color: "#666" },
  qr: { width: 90, height: 90, borderWidth: 1, borderColor: "#ddd", borderRadius: 4 },
  small: { fontSize: 8, color: "#666" },
  sectionTitle: { fontSize: 11, marginBottom: 6 },
  itemRow: { flexDirection: "row", gap: 10, marginTop: 3 },
  itemLabel: { width: 140, color: "#666" },
  itemValue: { flex: 1 },
});

function normValue(v: any): string | null {
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

export async function renderCertificatePdf(row: CertRow, publicUrl: string) {
  const preset = row.content_preset_json ?? {};
  const schema: TemplateSchema | null = (preset.schema_snapshot as any) ?? null;
  const values: Record<string, any> | null = (preset.values as any) ?? null;

  const vehicle = row.vehicle_info_json ?? {};
  const model = String(vehicle.model ?? "").trim();
  const plate = String(vehicle.plate ?? "").trim();

  const presetLines = buildPresetLines(schema, values);

  // ✅ ロゴは失敗しても落とさない
  let logoUrl: string | null = null;
  try {
    logoUrl = row.logo_asset_path ? await createSignedAssetUrl(row.logo_asset_path, 3600) : null;
  } catch {
    logoUrl = null;
  }

  const qrDataUrl = await QRCode.toDataURL(publicUrl, { margin: 1, width: 220 });

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <View style={styles.titleRow}>
              {logoUrl ? <Image src={logoUrl} style={{ height: 26, width: 120 }} /> : null}
              <Text style={styles.title}>施工証明書</Text>
            </View>
            <Text style={styles.meta}>公開ID: {row.public_id}</Text>
            <Text style={styles.meta}>発行日: {new Date(row.created_at).toLocaleString("ja-JP")}</Text>
          </View>
          <View>
            <Image src={qrDataUrl} style={styles.qr} />
            <Text style={styles.small}>QRで表示</Text>
          </View>
        </View>

        <View style={styles.box}>
          <Text style={styles.label}>お客様名</Text>
          <Text style={styles.value}>{row.customer_name}</Text>
        </View>

        {(model || plate) ? (
          <View style={styles.box}>
            <Text style={styles.label}>車両情報</Text>
            {model ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>車種</Text>
                <Text style={styles.itemValue}>{model}</Text>
              </View>
            ) : null}
            {plate ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>ナンバー</Text>
                <Text style={styles.itemValue}>{plate}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {presetLines.length > 0 ? (
          <View style={styles.box}>
            <Text style={styles.sectionTitle}>テンプレ項目</Text>
            {presetLines.map((it, idx) => (
              <View key={idx} style={styles.itemRow}>
                <Text style={styles.itemLabel}>[{it.section}] {it.label}</Text>
                <Text style={styles.itemValue}>{it.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {row.content_free_text ? (
          <View style={styles.box}>
            <Text style={styles.label}>施工内容（自由記述）</Text>
            <Text>{row.content_free_text}</Text>
          </View>
        ) : null}

        <View style={styles.box}>
          <Text style={styles.label}>有効条件</Text>
          <Text>{row.expiry_type ?? ""}: {row.expiry_value ?? ""}</Text>
        </View>

        <View style={styles.footer}>
          <Text>公開URL: {publicUrl}</Text>
          <Text>HOLY監修フッター（信頼担保）</Text>
        </View>
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}