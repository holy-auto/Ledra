import React from "react";
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { notoSansJpDataUrl } from "@/lib/marketing/pdfFonts";
import { fmtDate } from "@/lib/pdf/format";
import {
  measurementFieldsForForm,
  measurementGroup,
  type IndicatedInspectionForm,
  type MeasurementFieldDef,
} from "@/lib/validations/indicated-inspection";

/**
 * 指定整備記録簿（完成検査・第三号/四号様式）の測定値記録 PDF。 [G5 / Phase 1c]
 *
 * Phase 1b で構造化保存した「検査機器等による検査」の測定値を、様式のセル配列どおりに
 * 帳票化する（電磁的方法による作成・交付, 令和7年7月8日通達 §電磁的記録）。
 * 目視等による検査（構造・装置）と車両情報の照合欄は Phase 1b で未捕捉のため本 PDF でも
 * 未収載であることを明記する（空欄の official 様式そのままを描くと未記入と誤認されるため、
 * 収載済みの測定値のみを対象とする測定記録票として出力する）。
 */

Font.register({
  family: "NotoSansJP",
  fonts: [
    { src: notoSansJpDataUrl(400), fontWeight: 400 },
    { src: notoSansJpDataUrl(700), fontWeight: 700 },
  ],
});

export type IndicatedMeasurement = {
  field_code: string;
  num_value: number | null;
  text_value: string | null;
  unit: string | null;
  judgment: string | null;
};

export type IndicatedInspectionPdfData = {
  form: IndicatedInspectionForm;
  // 事業場名のみ。指定番号/認証番号・住所は tenants に正準カラムが無く（registration_number は
  // 適格請求書の登録番号で別物）、誤った識別子を法定様式に載せないため本票には収載しない。
  facility: { name: string | null };
  inspectorName: string | null;
  inspectedAt: string | null;
  vehicle: { maker: string | null; model: string | null; plate: string | null } | null;
  customerName: string | null;
  notes: string | null;
  measurements: IndicatedMeasurement[];
  generatedAt: string;
};

const FORM_LABEL: Record<IndicatedInspectionForm, string> = {
  sanago: "第三号様式（四輪）",
  yonago: "第四号様式（二輪）",
};

const JUDGMENT_LABEL: Record<string, string> = {
  pass: "良",
  fail: "否",
  na: "該当なし",
};

const C = {
  primary: "#1a1a2e",
  muted: "#636e72",
  border: "#c8ccd0",
  bg: "#f4f5f7",
  accent: "#1f2d5c",
  white: "#ffffff",
};

const s = StyleSheet.create({
  page: { padding: 34, fontSize: 9, fontFamily: "NotoSansJP", color: C.primary },
  headerBar: { backgroundColor: C.accent, height: 5, marginBottom: 14, borderRadius: 2 },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 10, color: C.muted, marginBottom: 12 },

  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 14 },
  metaItem: { width: "50%", marginBottom: 6, paddingRight: 8 },
  metaLabel: { fontSize: 7, color: C.muted, fontWeight: 700, marginBottom: 1 },
  metaValue: { fontSize: 10 },

  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: C.accent,
  },

  table: { borderWidth: 0.5, borderColor: C.border },
  headerRow: { flexDirection: "row", backgroundColor: C.accent },
  th: { fontSize: 8, fontWeight: 700, color: C.white, paddingVertical: 4, paddingHorizontal: 6 },
  row: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: C.border },
  rowAlt: { backgroundColor: C.bg },
  tdLabel: { width: "58%", fontSize: 8, paddingVertical: 3, paddingHorizontal: 6 },
  tdValue: { width: "42%", fontSize: 8, paddingVertical: 3, paddingHorizontal: 6, textAlign: "right" },

  notesBox: {
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 3,
    padding: 8,
    fontSize: 9,
    backgroundColor: C.bg,
  },
  scopeNote: { fontSize: 7.5, color: C.muted, marginTop: 4, lineHeight: 1.4 },

  footer: {
    position: "absolute",
    bottom: 18,
    left: 34,
    right: 34,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.muted,
  },
});

/** 1測定セルの表示値を組み立てる。値が無ければ空文字（＝様式の未記入セル）。 */
function formatValue(def: MeasurementFieldDef, m: IndicatedMeasurement | undefined): string {
  if (!m) return "";
  if (def.valueKind === "judgment") {
    return m.judgment ? (JUDGMENT_LABEL[m.judgment] ?? m.judgment) : "";
  }
  if (def.valueKind === "numeric") {
    if (m.num_value == null) return "";
    const unit = m.unit ?? def.units?.[0] ?? "";
    return unit ? `${m.num_value} ${unit}` : String(m.num_value);
  }
  // text
  if (!m.text_value) return "";
  const unit = m.unit ?? def.units?.[0] ?? "";
  return unit ? `${m.text_value} ${unit}` : m.text_value;
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaItem}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value || "—"}</Text>
    </View>
  );
}

function IndicatedInspectionDocument({ data }: { data: IndicatedInspectionPdfData }) {
  const fields = measurementFieldsForForm(data.form);
  const byCode = new Map(data.measurements.map((m) => [m.field_code, m]));

  // 様式のセル順を保ったままグループ化（カタログと同じ measurementGroup で見出しを付ける）。
  const groups: { name: string; fields: MeasurementFieldDef[] }[] = [];
  for (const f of fields) {
    const g = measurementGroup(f.code);
    const last = groups[groups.length - 1];
    if (last && last.name === g) last.fields.push(f);
    else groups.push({ name: g, fields: [f] });
  }

  const vehicleLine = data.vehicle ? [data.vehicle.maker, data.vehicle.model].filter(Boolean).join(" ") || "—" : "—";

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <View style={s.headerBar} />
        <Text style={s.title}>指定整備記録簿（完成検査）測定記録</Text>
        <Text style={s.subtitle}>{FORM_LABEL[data.form]}　検査機器等による検査</Text>

        <View style={s.metaGrid}>
          <MetaItem label="事業場名" value={data.facility.name ?? ""} />
          <MetaItem label="自動車検査員" value={data.inspectorName ?? ""} />
          <MetaItem label="検査年月日" value={fmtDate(data.inspectedAt)} />
          <MetaItem label="使用者 / 依頼者" value={data.customerName ?? ""} />
          <MetaItem label="車両（車名・型式）" value={vehicleLine} />
          <MetaItem label="登録番号 / 車両番号" value={data.vehicle?.plate ?? ""} />
        </View>

        {groups.map((g) => (
          <View key={g.name} style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>{g.name}</Text>
            <View style={s.table}>
              <View style={s.headerRow}>
                <Text style={[s.th, { width: "58%" }]}>測定項目</Text>
                <Text style={[s.th, { width: "42%", textAlign: "right" }]}>測定値</Text>
              </View>
              {g.fields.map((f, i) => (
                <View key={f.code} style={[s.row, i % 2 === 1 ? s.rowAlt : {}]}>
                  <Text style={s.tdLabel}>{f.label}</Text>
                  <Text style={s.tdValue}>{formatValue(f, byCode.get(f.code))}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={s.section}>
          <Text style={s.sectionTitle}>点検及び整備の概要 / 備考</Text>
          <View style={s.notesBox}>
            <Text>{data.notes || "—"}</Text>
          </View>
          <Text style={s.scopeNote}>
            ※ 本票は「検査機器等による検査」の測定値記録です。目視等による検査（構造・装置の各項目）
            および車両諸元の照合欄は本票には含まれません。
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text>Ledra 指定整備記録簿 / {FORM_LABEL[data.form]}</Text>
          <Text>出力: {fmtDate(data.generatedAt)}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderIndicatedInspectionPdf(data: IndicatedInspectionPdfData): Promise<Buffer> {
  return renderToBuffer(<IndicatedInspectionDocument data={data} />);
}
