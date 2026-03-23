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
  coating_products_json?: any[] | null;
  ppf_coverage_json?: any[] | null;
  service_type?: string | null;
  expiry_type: string | null;
  expiry_value: string | null;
  warranty_period_end?: string | null;
  warranty_exclusions?: string | null;
  logo_asset_path: string | null;
  created_at: string;
  current_version?: number | null;
};

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, fontFamily: "NotoSansJP" },
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
  const color = String(vehicle.color ?? "").trim();
  const isPpf = row.service_type === "ppf";
  const ppfCoverage: any[] = Array.isArray(row.ppf_coverage_json) ? row.ppf_coverage_json : [];

  const presetLines = buildPresetLines(schema, values);

  let logoUrl: string | null = null;
  try {
    logoUrl = row.logo_asset_path ? await createSignedAssetUrl(row.logo_asset_path, 3600) : null;
  } catch {
    logoUrl = null;
  }

  const qrDataUrl = await QRCode.toDataURL(publicUrl, { margin: 1, width: 220 });
  const certTitle = isPpf ? "PPF施工証明書" : "施工証明書";
  const productsTitle = isPpf ? "使用フィルム" : "コーティング剤";

  const doc = (
    <Document>
      {/* ── ページ1: 証明書本体 ── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <View style={styles.titleRow}>
              {logoUrl ? <Image src={logoUrl} style={{ height: 26, width: 120 }} /> : null}
              <Text style={styles.title}>{certTitle}</Text>
            </View>
            <Text style={styles.meta}>証明書番号: {row.public_id}</Text>
            <Text style={styles.meta}>発行日: {new Date(row.created_at).toLocaleDateString("ja-JP")}</Text>
            {(row.current_version ?? 1) > 1 && (
              <Text style={[styles.meta, { color: "#c00" }]}>再発行版（第{row.current_version}版）</Text>
            )}
          </View>
          <View>
            <Image src={qrDataUrl} style={styles.qr} />
            <Text style={styles.small}>QRで確認</Text>
          </View>
        </View>

        {/* 証明文 */}
        {isPpf && (
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 9, color: "#444", lineHeight: 1.6 }}>
              本証明書は、下記車両に対してペイントプロテクションフィルム（PPF）の施工が完了した事実を証明するものです。
            </Text>
          </View>
        )}

        <View style={styles.box}>
          <Text style={styles.label}>お客様名</Text>
          <Text style={styles.value}>{row.customer_name}</Text>
        </View>

        {(model || plate) ? (
          <View style={styles.box}>
            <Text style={styles.sectionTitle}>車両情報</Text>
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
            {color ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>ボディカラー</Text>
                <Text style={styles.itemValue}>{color}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* 使用フィルム / コーティング剤 */}
        {Array.isArray(row.coating_products_json) && row.coating_products_json.length > 0 ? (
          <View style={styles.box}>
            <Text style={styles.sectionTitle}>{productsTitle}</Text>
            {row.coating_products_json.map((cp: any, idx: number) => (
              <View key={idx} style={styles.itemRow}>
                <Text style={styles.itemLabel}>{cp.location || "-"}</Text>
                <Text style={styles.itemValue}>
                  {[cp.brand_name, cp.product_name, cp.film_type ? getFilmTypeLabel(cp.film_type) : null].filter(Boolean).join(" / ") || "-"}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* PPF施工範囲 */}
        {isPpf && ppfCoverage.length > 0 ? (
          <View style={styles.box}>
            <Text style={styles.sectionTitle}>施工範囲</Text>
            {ppfCoverage.map((entry: any, idx: number) => (
              <View key={idx} style={styles.itemRow}>
                <Text style={styles.itemLabel}>{getPanelLabel(entry.panel)}</Text>
                <Text style={styles.itemValue}>
                  {getCoverageLabel(entry.coverage)}
                  {entry.partial_note ? ` — ${entry.partial_note}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {presetLines.length > 0 ? (
          <View style={styles.box}>
            <Text style={styles.sectionTitle}>施工内容</Text>
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
          <Text>証明書URL: {publicUrl}</Text>
          <Text style={{ fontSize: 7, color: "#999", marginTop: 2 }}>Powered by CARTRUST</Text>
        </View>
      </Page>

      {/* ── ページ2: 保証・注意事項（PPFの場合のみ） ── */}
      {isPpf && (
        <Page size="A4" style={styles.page}>
          <View>
            <Text style={styles.title}>{certTitle} — 保証・注意事項</Text>
            <Text style={styles.meta}>証明書番号: {row.public_id}</Text>
          </View>

          {/* 保証情報 */}
          {row.warranty_period_end && (
            <View style={styles.box}>
              <Text style={styles.sectionTitle}>保証情報</Text>
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>保証期間終了日</Text>
                <Text style={styles.itemValue}>{row.warranty_period_end}</Text>
              </View>
            </View>
          )}

          {/* 保証対象外事項 */}
          {row.warranty_exclusions && (
            <View style={styles.box}>
              <Text style={styles.sectionTitle}>保証対象外事項</Text>
              <Text style={{ fontSize: 9, lineHeight: 1.6 }}>{row.warranty_exclusions}</Text>
            </View>
          )}

          {/* 注意事項 */}
          <View style={styles.box}>
            <Text style={styles.sectionTitle}>フィルムのお取り扱いについて</Text>
            <Text style={{ fontSize: 8, lineHeight: 1.7, color: "#444" }}>
              {[
                "・施工後48時間は洗車およびフィルム端部への接触をお控えください。",
                "・洗車は中性洗剤を使用した手洗いを推奨します。",
                "・高圧洗浄機をご使用の際は、フィルム端部から30cm以上離してください。",
                "・ワックスやコンパウンドをフィルム面に使用しないでください。",
                "・フィルムの端部が浮いた場合は、ご自身で処置せず施工店にご連絡ください。",
              ].join("\n")}
            </Text>
          </View>

          {/* 免責事項 */}
          <View style={styles.box}>
            <Text style={styles.sectionTitle}>免責事項</Text>
            <Text style={{ fontSize: 8, lineHeight: 1.7, color: "#444" }}>
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

          {/* QR照会案内 */}
          <View style={styles.box}>
            <Text style={styles.sectionTitle}>オンライン照会について</Text>
            <Text style={{ fontSize: 8, lineHeight: 1.7, color: "#444" }}>
              本証明書に記載のQRコードをスマートフォンで読み取ると、CARTRUST認証プラットフォーム上で本証明書の最新情報をリアルタイムに確認できます。
            </Text>
          </View>

          <View style={styles.footer}>
            <Text style={{ fontSize: 7, color: "#999" }}>Powered by CARTRUST</Text>
          </View>
        </Page>
      )}
    </Document>
  );

  return await renderToBuffer(doc);
}