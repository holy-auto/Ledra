import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSignedAssetUrl } from "@/lib/signedUrl";

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

const DOC_TYPE_LABELS: Record<string, string> = {
  estimate: "見積書",
  delivery: "納品書",
  purchase_order: "発注書",
  order_confirmation: "発注請書",
  inspection: "検収書",
  receipt: "領収書",
  invoice: "請求書",
  consolidated_invoice: "合算請求書",
};

/* Spaced title for formal documents (e.g. "請 求 書") */
function spacedTitle(label: string): string {
  return label.split("").join(" ");
}

type DocumentItem = {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  tax_category?: number;
};

type BankInfo = {
  bank_name?: string | null;
  branch_name?: string | null;
  account_type?: string | null;
  account_number?: string | null;
  account_holder?: string | null;
};

export type DocForPdf = {
  id: string;
  doc_type: string;
  doc_number: string;
  issued_at: string | null;
  due_date: string | null;
  subtotal: number;
  tax: number;
  total: number;
  tax_rate: number;
  note: string | null;
  items_json: DocumentItem[];
  is_invoice_compliant: boolean;
  show_seal: boolean;
  show_logo: boolean;
  show_bank_info: boolean;
  recipient_name: string | null;
};

export type TenantForDocPdf = {
  name: string;
  address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  registration_number: string | null;
  logo_asset_path: string | null;
  company_seal_path: string | null;
  bank_info: BankInfo | null;
};

function fmtJpy(n: number | null | undefined): string {
  if (n == null) return "-";
  return `¥${n.toLocaleString("ja-JP")}`;
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("ja-JP");
}

function fmtTotal(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("ja-JP");
}

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "NotoSansJP" },
  /* ── Header row: title left, No+date right ── */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  title: { fontSize: 22, fontWeight: 700, letterSpacing: 6 },
  metaRight: { textAlign: "right", fontSize: 9, color: "#444" },
  /* ── Main 2-col area: left summary / right sender ── */
  mainRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  leftCol: { flex: 1, paddingRight: 20 },
  rightCol: { width: 220, alignItems: "flex-end" },
  /* left col */
  recipientName: { fontSize: 14, fontWeight: 700, marginBottom: 14 },
  summaryTable: { marginBottom: 12 },
  summaryRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
  },
  summaryLabel: { width: 60, fontSize: 9, fontWeight: 700, color: "#444" },
  summaryValue: { flex: 1, fontSize: 9, color: "#333" },
  totalBig: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  totalBigLabel: { fontSize: 10, fontWeight: 700, color: "#c00" },
  totalBigValue: { fontSize: 22, fontWeight: 700 },
  totalBigUnit: { fontSize: 10, color: "#666" },
  /* right col — sender */
  logo: { height: 80, marginBottom: 10 },
  senderName: { fontSize: 11, fontWeight: 700, textAlign: "right" },
  senderLine: { fontSize: 9, textAlign: "right", color: "#444", marginTop: 1 },
  sealImage: { width: 64, height: 64, marginTop: 8 },
  sealPlaceholder: {
    width: 52,
    height: 52,
    borderWidth: 1,
    borderColor: "#c00",
    borderRadius: 26,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  sealText: { fontSize: 14, color: "#c00" },
  /* ── Items table ── */
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: "#333",
    paddingBottom: 4,
    marginTop: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    paddingVertical: 5,
  },
  colDesc: { flex: 3, paddingRight: 4 },
  colQty: { width: 50, textAlign: "right" },
  colPrice: { width: 70, textAlign: "right" },
  colAmount: { width: 80, textAlign: "right" },
  thText: { fontSize: 8, color: "#666", fontWeight: 700 },
  /* ── Totals ── */
  totalsWrap: { alignItems: "flex-end", marginTop: 12 },
  totalsBox: { width: 200 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
  },
  totalLabel: { color: "#666", fontSize: 9 },
  totalValue: { fontSize: 10 },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    marginTop: 2,
  },
  grandTotalLabel: { fontSize: 12, fontWeight: 700 },
  grandTotalValue: { fontSize: 12, fontWeight: 700 },
  /* ── Note / Compliance ── */
  noteSection: {
    borderTopWidth: 0.5,
    borderTopColor: "#ddd",
    paddingTop: 10,
    marginTop: 14,
  },
  noteLabel: { fontSize: 8, color: "#888" },
  noteText: { fontSize: 9, color: "#444", marginTop: 2 },
  compliance: {
    borderTopWidth: 0.5,
    borderTopColor: "#ddd",
    paddingTop: 8,
    marginTop: 10,
    fontSize: 7,
    color: "#888",
  },
});

export async function renderDocumentPdf(
  doc: DocForPdf,
  tenant: TenantForDocPdf,
  customerName: string | null,
) {
  const docLabel = DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type;

  let logoUrl: string | null = null;
  try {
    logoUrl =
      doc.show_logo && tenant.logo_asset_path
        ? await createSignedAssetUrl(tenant.logo_asset_path, 3600)
        : null;
  } catch {
    logoUrl = null;
  }

  let sealUrl: string | null = null;
  try {
    sealUrl =
      doc.show_seal && tenant.company_seal_path
        ? await createSignedAssetUrl(tenant.company_seal_path, 3600)
        : null;
  } catch {
    sealUrl = null;
  }

  const items = doc.items_json ?? [];
  const recipientName = doc.recipient_name || customerName;
  const bank = tenant.bank_info;

  const pdfDoc = (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Header: Title left / No+Date right ── */}
        <View style={s.header}>
          <Text style={s.title}>{spacedTitle(docLabel)}</Text>
          <View style={s.metaRight}>
            <Text>No：{doc.doc_number}</Text>
            <Text>発行日：{fmtDate(doc.issued_at)}</Text>
          </View>
        </View>

        {/* ── Main 2-col: left summary / right sender ── */}
        <View style={s.mainRow}>
          {/* Left column: recipient, summary info, grand total */}
          <View style={s.leftCol}>
            {recipientName && (
              <Text style={s.recipientName}>{recipientName} 御中</Text>
            )}

            <Text style={{ fontSize: 9, color: "#444", marginBottom: 12 }}>
              下記のとおり、御請求申し上げます。
            </Text>

            {/* Summary fields */}
            <View style={s.summaryTable}>
              {doc.due_date && (
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>支払期限</Text>
                  <Text style={s.summaryValue}>{fmtDate(doc.due_date)}</Text>
                </View>
              )}
              {doc.show_bank_info && bank && (
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>振込先</Text>
                  <View style={{ flex: 1 }}>
                    {bank.bank_name && (
                      <Text style={s.summaryValue}>
                        {bank.bank_name}
                        {bank.branch_name ? ` ${bank.branch_name}` : ""}
                        {bank.account_type ? ` ${bank.account_type}` : ""}
                        {bank.account_number ? ` ${bank.account_number}` : ""}
                        {bank.account_holder ? ` ${bank.account_holder}` : ""}
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* Grand total (big) */}
            <View style={s.totalBig}>
              <Text style={s.totalBigLabel}>合計金額</Text>
              <Text style={s.totalBigValue}>{fmtTotal(doc.total)}</Text>
              <Text style={s.totalBigUnit}>円（税込）</Text>
            </View>
          </View>

          {/* Right column: logo, company info, seal */}
          <View style={s.rightCol}>
            {logoUrl && <Image src={logoUrl} style={s.logo} />}

            <Text style={s.senderName}>{tenant.name}</Text>
            {tenant.address && <Text style={s.senderLine}>{tenant.address}</Text>}
            {tenant.contact_phone && (
              <Text style={s.senderLine}>TEL：{tenant.contact_phone}</Text>
            )}
            {tenant.contact_email && (
              <Text style={s.senderLine}>{tenant.contact_email}</Text>
            )}
            {doc.is_invoice_compliant && tenant.registration_number && (
              <Text style={s.senderLine}>
                登録番号：{tenant.registration_number}
              </Text>
            )}

            {/* Seal / 角印 — directly below sender info */}
            {sealUrl ? (
              <Image src={sealUrl} style={s.sealImage} />
            ) : doc.show_seal ? (
              <View style={s.sealPlaceholder}>
                <Text style={s.sealText}>印</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Items table ── */}
        <View style={s.tableHead}>
          <Text style={{ ...s.thText, ...s.colDesc }}>摘要</Text>
          <Text style={{ ...s.thText, ...s.colQty }}>数量</Text>
          <Text style={{ ...s.thText, ...s.colPrice }}>単価</Text>
          <Text style={{ ...s.thText, ...s.colAmount }}>金額</Text>
        </View>
        {items.map((item, idx) => (
          <View key={idx} style={s.tableRow}>
            <Text style={s.colDesc}>
              {item.description || "-"}
              {item.tax_category === 8 ? " ※軽減" : ""}
            </Text>
            <Text style={s.colQty}>{item.quantity}</Text>
            <Text style={s.colPrice}>{fmtJpy(item.unit_price)}</Text>
            <Text style={s.colAmount}>{fmtJpy(item.amount)}</Text>
          </View>
        ))}

        {/* ── Totals ── */}
        <View style={s.totalsWrap}>
          <View style={s.totalsBox}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>小計</Text>
              <Text style={s.totalValue}>{fmtJpy(doc.subtotal)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>消費税（{doc.tax_rate}%）</Text>
              <Text style={s.totalValue}>{fmtJpy(doc.tax)}</Text>
            </View>
            <View style={s.grandTotalRow}>
              <Text style={s.grandTotalLabel}>合計</Text>
              <Text style={s.grandTotalValue}>{fmtJpy(doc.total)}</Text>
            </View>
          </View>
        </View>

        {/* ── Note ── */}
        {doc.note && (
          <View style={s.noteSection}>
            <Text style={s.noteLabel}>備考</Text>
            <Text style={s.noteText}>{doc.note}</Text>
          </View>
        )}

        {/* ── Compliance ── */}
        {doc.is_invoice_compliant && (
          <View style={s.compliance}>
            <Text>
              ※ この書類は適格請求書等保存方式（インボイス制度）に対応しています。
            </Text>
          </View>
        )}
      </Page>
    </Document>
  );

  return await renderToBuffer(pdfDoc);
}
