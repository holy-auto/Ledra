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

/** PDF に埋め込む電子署名情報（省略時は署名セクションなし） */
export type PdfSignatureSection = {
  signedAt:             string;   // ISO 8601
  signerEmailMasked:    string;   // "t****@example.com"
  signaturePreview:     string;   // 署名値の先頭20文字 + "..."
  publicKeyFingerprint: string;   // "SHA256:xxxxxxxx..."
  verifyUrl:            string;   // "https://ledra.co.jp/verify/..."
  documentHash:         string;   // SHA-256 (hex)
};

export async function renderCertificatePdf(row: CertRow, publicUrl: string, signatureSection?: PdfSignatureSection) {
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
  const certTitle = isPpf ? "PPF施工証明書"
    : isMaintenance ? "整備証明書"
    : isBodyRepair ? "鈑金塗装証明書"
    : "施工証明書";
  const productsTitle = isPpf ? "使用フィルム" : "コーティング剤";

  // 電子署名セクション（署名情報がある場合のみ表示）
  const signatureSectionJsx = signatureSection ? (
    <View style={{ borderWidth: 1.5, borderColor: "#1a56db", padding: 10, borderRadius: 6, marginTop: 14 }}>
      <Text style={{ fontSize: 10, marginBottom: 6, color: "#1a56db" }}>電子署名（電子署名法第2条）</Text>
      <View style={{ gap: 3 }}>
        <View style={{ flexDirection: "row" }}>
          <Text style={{ color: "#666", fontSize: 9, width: 110 }}>署名日時</Text>
          <Text style={{ fontSize: 9 }}>{new Date(signatureSection.signedAt).toLocaleString("ja-JP")}</Text>
        </View>
        <View style={{ flexDirection: "row" }}>
          <Text style={{ color: "#666", fontSize: 9, width: 110 }}>署名者</Text>
          <Text style={{ fontSize: 9 }}>{signatureSection.signerEmailMasked}</Text>
        </View>
        <View style={{ flexDirection: "row" }}>
          <Text style={{ color: "#666", fontSize: 9, width: 110 }}>ハッシュ (SHA-256)</Text>
          <Text style={{ fontSize: 7, color: "#444" }}>{signatureSection.documentHash}</Text>
        </View>
        <View style={{ flexDirection: "row" }}>
          <Text style={{ color: "#666", fontSize: 9, width: 110 }}>署名値（省略）</Text>
          <Text style={{ fontSize: 7, color: "#444" }}>{signatureSection.signaturePreview}</Text>
        </View>
        <View style={{ flexDirection: "row" }}>
          <Text style={{ color: "#666", fontSize: 9, width: 110 }}>公開鍵フィンガープリント</Text>
          <Text style={{ fontSize: 7, color: "#444" }}>{signatureSection.publicKeyFingerprint}</Text>
        </View>
        <View style={{ flexDirection: "row", marginTop: 4 }}>
          <Text style={{ color: "#666", fontSize: 9, width: 110 }}>署名検証URL</Text>
          <Text style={{ fontSize: 8, color: "#1a56db" }}>{signatureSection.verifyUrl}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 7, color: "#666", marginTop: 6, lineHeight: 1.6 }}>
        本署名は電子署名法（平成12年法律第102号）第2条に基づく立会人型電子署名です。ECDSA P-256 アルゴリズムにより改ざん検知が可能です。
      </Text>
    </View>
  ) : null;

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
        {isMaintenance && (
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 9, color: "#444", lineHeight: 1.6 }}>
              本証明書は、下記車両に対して整備作業が実施された事実を証明するものです。
            </Text>
          </View>
        )}
        {isBodyRepair && (
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 9, color: "#444", lineHeight: 1.6 }}>
              本証明書は、下記車両に対して鈑金塗装作業が実施された事実を証明するものです。
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
            {row.coating_products_json.map((cp: Record<string, any>, idx: number) => (
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
            {ppfCoverage.map((entry: Record<string, any>, idx: number) => (
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

        {/* 整備内容 */}
        {isMaintenance && Object.keys(maintenanceData).length > 0 ? (
          <View style={styles.box}>
            <Text style={styles.sectionTitle}>整備内容</Text>
            {Array.isArray(maintenanceData.work_types) && maintenanceData.work_types.length > 0 ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>作業種別</Text>
                <Text style={styles.itemValue}>
                  {maintenanceData.work_types.map((wt: string) => getWorkTypeLabel(wt)).join("、")}
                </Text>
              </View>
            ) : null}
            {maintenanceData.mileage ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>走行距離</Text>
                <Text style={styles.itemValue}>{maintenanceData.mileage} km</Text>
              </View>
            ) : null}
            {maintenanceData.parts_replaced ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>交換部品</Text>
                <Text style={styles.itemValue}>{maintenanceData.parts_replaced}</Text>
              </View>
            ) : null}
            {maintenanceData.next_service_date ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>次回点検日</Text>
                <Text style={styles.itemValue}>{maintenanceData.next_service_date}</Text>
              </View>
            ) : null}
            {maintenanceData.findings ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>点検結果・所見</Text>
                <Text style={styles.itemValue}>{maintenanceData.findings}</Text>
              </View>
            ) : null}
            {maintenanceData.mechanic_name ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>担当整備士</Text>
                <Text style={styles.itemValue}>{maintenanceData.mechanic_name}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* 鈑金塗装内容 */}
        {isBodyRepair && Object.keys(bodyRepairData).length > 0 ? (
          <View style={styles.box}>
            <Text style={styles.sectionTitle}>鈑金塗装内容</Text>
            {bodyRepairData.repair_type ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>修理種別</Text>
                <Text style={styles.itemValue}>{getRepairTypeLabel(bodyRepairData.repair_type)}</Text>
              </View>
            ) : null}
            {Array.isArray(bodyRepairData.affected_panels) && bodyRepairData.affected_panels.length > 0 ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>修理箇所</Text>
                <Text style={styles.itemValue}>
                  {bodyRepairData.affected_panels.map((p: string) => getRepairPanelLabel(p)).join("、")}
                </Text>
              </View>
            ) : null}
            {bodyRepairData.paint_color_code ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>塗装色・カラーコード</Text>
                <Text style={styles.itemValue}>{bodyRepairData.paint_color_code}</Text>
              </View>
            ) : null}
            {bodyRepairData.paint_type ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>塗装タイプ</Text>
                <Text style={styles.itemValue}>{getPaintTypeLabel(bodyRepairData.paint_type)}</Text>
              </View>
            ) : null}
            {Array.isArray(bodyRepairData.repair_methods) && bodyRepairData.repair_methods.length > 0 ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>修理方法</Text>
                <Text style={styles.itemValue}>
                  {bodyRepairData.repair_methods.map((m: string) => getRepairMethodLabel(m)).join("、")}
                </Text>
              </View>
            ) : null}
            {bodyRepairData.before_notes ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>修理前の状態</Text>
                <Text style={styles.itemValue}>{bodyRepairData.before_notes}</Text>
              </View>
            ) : null}
            {bodyRepairData.after_notes ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>修理後の状態</Text>
                <Text style={styles.itemValue}>{bodyRepairData.after_notes}</Text>
              </View>
            ) : null}
            {bodyRepairData.warranty_info ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>修理保証</Text>
                <Text style={styles.itemValue}>{bodyRepairData.warranty_info}</Text>
              </View>
            ) : null}
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

        {/* コーティング等（PPF/整備/鈑金以外）は Page1 のみ → 署名セクションをここに表示 */}
        {!isPpf && !isMaintenance && !isBodyRepair && signatureSectionJsx}

        <View style={styles.footer}>
          <Text>証明書URL: {publicUrl}</Text>
          <Text style={{ fontSize: 7, color: "#999", marginTop: 2 }}>Powered by Ledra</Text>
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
              本証明書に記載のQRコードをスマートフォンで読み取ると、Ledra認証プラットフォーム上で本証明書の最新情報をリアルタイムに確認できます。
            </Text>
          </View>

          {signatureSectionJsx}

          <View style={styles.footer}>
            <Text style={{ fontSize: 7, color: "#999" }}>Powered by Ledra</Text>
          </View>
        </Page>
      )}

      {/* ── ページ2: 注意事項（整備の場合） ── */
      {isMaintenance && (
        <Page size="A4" style={styles.page}>
          <View>
            <Text style={styles.title}>{certTitle} — 注意事項</Text>
            <Text style={styles.meta}>証明書番号: {row.public_id}</Text>
          </View>

          {row.warranty_period_end && (
            <View style={styles.box}>
              <Text style={styles.sectionTitle}>保証情報</Text>
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>保証期間終了日</Text>
                <Text style={styles.itemValue}>{row.warranty_period_end}</Text>
              </View>
            </View>
          )}

          {row.warranty_exclusions && (
            <View style={styles.box}>
              <Text style={styles.sectionTitle}>保証対象外事項</Text>
              <Text style={{ fontSize: 9, lineHeight: 1.6 }}>{row.warranty_exclusions}</Text>
            </View>
          )}

          <View style={styles.box}>
            <Text style={styles.sectionTitle}>整備後のご注意</Text>
            <Text style={{ fontSize: 8, lineHeight: 1.7, color: "#444" }}>
              {[
                "・整備後は慣らし運転を推奨します。急加速・急ブレーキはお控えください。",
                "・オイル交換後は100km走行後にオイル量を再確認してください。",
                "・異音、振動、警告灯の点灯等の異常が発生した場合は速やかにご連絡ください。",
                "・定期的な点検・メンテナンスが車両の長寿命化につながります。",
                "・次回点検日が記載されている場合は、期日までの点検をお勧めします。",
              ].join("\n")}
            </Text>
          </View>

          <View style={styles.box}>
            <Text style={styles.sectionTitle}>免責事項</Text>
            <Text style={{ fontSize: 8, lineHeight: 1.7, color: "#444" }}>
              {[
                "本証明書は整備作業が実施された事実を証明するものであり、車両の状態や性能を保証するものではありません。",
                "以下の事項については保証の対象外となります。",
                "",
                "・整備箇所以外の部品・装置の不具合",
                "・お客様の使用方法に起因する故障・損傷",
                "・事故、災害等の外的要因による損傷",
                "・当店以外での整備・修理・改造後に生じた不具合",
                "・消耗品の通常摩耗",
                "",
                "保証の適用にあたっては、当店による現車確認が必要となる場合があります。",
              ].join("\n")}
            </Text>
          </View>

          <View style={styles.box}>
            <Text style={styles.sectionTitle}>オンライン照会について</Text>
            <Text style={{ fontSize: 8, lineHeight: 1.7, color: "#444" }}>
              本証明書に記載のQRコードをスマートフォンで読み取ると、Ledra認証プラットフォーム上で本証明書の最新情報をリアルタイムに確認できます。
            </Text>
          </View>

          {signatureSectionJsx}

          <View style={styles.footer}>
            <Text style={{ fontSize: 7, color: "#999" }}>Powered by Ledra</Text>
          </View>
        </Page>
      )}

      {/* ── ページ2: 保証・注意事項（鈑金塗装の場合） ── */
      {isBodyRepair && (
        <Page size="A4" style={styles.page}>
          <View>
            <Text style={styles.title}>{certTitle} — 保証・注意事項</Text>
            <Text style={styles.meta}>証明書番号: {row.public_id}</Text>
          </View>

          {row.warranty_period_end && (
            <View style={styles.box}>
              <Text style={styles.sectionTitle}>保証情報</Text>
              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>保証期間終了日</Text>
                <Text style={styles.itemValue}>{row.warranty_period_end}</Text>
              </View>
            </View>
          )}

          {bodyRepairData.warranty_info && (
            <View style={styles.box}>
              <Text style={styles.sectionTitle}>修理保証内容</Text>
              <Text style={{ fontSize: 9, lineHeight: 1.6 }}>{bodyRepairData.warranty_info}</Text>
            </View>
          )}

          {row.warranty_exclusions && (
            <View style={styles.box}>
              <Text style={styles.sectionTitle}>保証対象外事項</Text>
              <Text style={{ fontSize: 9, lineHeight: 1.6 }}>{row.warranty_exclusions}</Text>
            </View>
          )}

          <View style={styles.box}>
            <Text style={styles.sectionTitle}>塗装後のご注意</Text>
            <Text style={{ fontSize: 8, lineHeight: 1.7, color: "#444" }}>
              {[
                "・塗装後1週間は洗車をお控えください。",
                "・塗装後1ヶ月間はワックスがけをお控えください。",
                "・高圧洗浄機のご使用は塗装面から30cm以上離してください。",
                "・鳥の糞、樹液等の付着物は速やかに除去してください。",
                "・塗装面の異常（剥がれ、膨れ、変色等）を発見した場合は速やかにご連絡ください。",
                "・研磨剤入りのワックスやコンパウンドの使用はお控えください。",
              ].join("\n")}
            </Text>
          </View>

          <View style={styles.box}>
            <Text style={styles.sectionTitle}>免責事項</Text>
            <Text style={{ fontSize: 8, lineHeight: 1.7, color: "#444" }}>
              {[
                "本証明書は鈑金塗装作業が実施された事実を証明するものであり、車両の状態や性能を保証するものではありません。",
                "以下の事項については保証の対象外となります。",
                "",
                "・飛び石、事故その他の外的要因による損傷",
                "・不適切なメンテナンスに起因する劣化・損傷",
                "・当店以外での施工、修理、改造後に生じた不具合",
                "・自然災害（台風、雹、洪水等）による損傷",
                "・経年による通常の劣化・退色",
                "・車両の製造上の塗装不良に起因する問題",
                "",
                "保証の適用にあたっては、当店による現車確認が必要となる場合があります。",
              ].join("\n")}
            </Text>
          </View>

          <View style={styles.box}>
            <Text style={styles.sectionTitle}>オンライン照会について</Text>
            <Text style={{ fontSize: 8, lineHeight: 1.7, color: "#444" }}>
              本証明書に記載のQRコードをスマートフォンで読み取ると、Ledra認証プラットフォーム上で本証明書の最新情報をリアルタイムに確認できます。
            </Text>
          </View>

          {signatureSectionJsx}

          <View style={styles.footer}>
            <Text style={{ fontSize: 7, color: "#999" }}>Powered by Ledra</Text>
          </View>
        </Page>
      )}
    </Document>
  );

  return await renderToBuffer(doc);
}