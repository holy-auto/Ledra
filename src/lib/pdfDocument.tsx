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

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "NotoSansJP" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: 700 },
  docNum: { color: "#666", fontSize: 9, marginTop: 4 },
  regNum: { color: "#666", fontSize: 8, marginTop: 2 },
  dateBlock: { textAlign: "right", fontSize: 9, color: "#444" },
  row2col: { flexDirection: "row", gap: 20, marginBottom: 16 },
  colHalf: { flex: 1 },
  sectionLabel: { fontSize: 8, color: "#888", marginBottom: 4 },
  customerName: { fontSize: 14, fontWeight: 700 },
  tenantLine: { fontSize: 9, color: "#444", marginTop: 1 },
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
  stampRow: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 16 },
  logoBox: { width: 52, height: 52 },
  sealBox: {
    width: 52,
    height: 52,
    borderWidth: 1,
    borderColor: "#c00",
    borderRadius: 26,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  sealText: { fontSize: 14, color: "#c00" },
  bankSection: {
    borderTopWidth: 0.5,
    borderTopColor: "#ddd",
    paddingTop: 10,
    marginTop: 14,
  },
  bankTitle: { fontSize: 8, fontWeight: 700, color: "#666", marginBottom: 4 },
  bankLine: { fontSize: 9, color: "#444", marginTop: 1 },
  noteSection: {
    borderTopWidth: 0.5,
    borderTopColor: "#ddd",
    paddingTop: 10,
    marginTop: 10,
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
        {/* Header */}
        <View style={s.header}>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {logoUrl ? (
                <Image src={logoUrl} style={{ height: 24, width: 100 }} />
              ) : null}
              <Text style={s.title}>{docLabel}</Text>
            </View>
            <Text style={s.docNum}>{doc.doc_number}</Text>
            {doc.is_invoice_compliant && tenant.registration_number && (
              <Text style={s.regNum}>登録番号: {tenant.registration_number}</Text>
            )}
          </View>
          <View style={s.dateBlock}>
            <Text>発行日: {fmtDate(doc.issued_at)}</Text>
            {doc.due_date && <Text>支払期限: {fmtDate(doc.due_date)}</Text>}
          </View>
        </View>

        {/* Customer / Issuer */}
        <View style={s.row2col}>
          {recipientName && (
            <View style={s.colHalf}>
              <Text style={s.sectionLabel}>宛先</Text>
              <Text style={s.customerName}>{recipientName} 様</Text>
            </View>
          )}
          <View style={s.colHalf}>
            <Text style={s.sectionLabel}>差出人</Text>
            <Text style={{ fontSize: 11, fontWeight: 700 }}>{tenant.name}</Text>
            {tenant.address && <Text style={s.tenantLine}>{tenant.address}</Text>}
            {tenant.contact_phone && (
              <Text style={s.tenantLine}>TEL: {tenant.contact_phone}</Text>
            )}
            {tenant.contact_email && (
              <Text style={s.tenantLine}>{tenant.contact_email}</Text>
            )}
          </View>
        </View>

        {/* Items table */}
        <View style={s.tableHead}>
          <Text style={{ ...s.thText, ...s.colDesc }}>内容</Text>
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

        {/* Totals */}
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

        {/* Seal */}
        {(sealUrl || (doc.show_seal && !sealUrl)) && (
          <View style={s.stampRow}>
            {sealUrl ? (
              <Image src={sealUrl} style={s.logoBox} />
            ) : doc.show_seal ? (
              <View style={s.sealBox}>
                <Text style={s.sealText}>印</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Bank info */}
        {doc.show_bank_info && bank && (
          <View style={s.bankSection}>
            <Text style={s.bankTitle}>振込先口座情報</Text>
            {bank.bank_name && (
              <Text style={s.bankLine}>
                {bank.bank_name}
                {bank.branch_name ? ` ${bank.branch_name}` : ""}
              </Text>
            )}
            {bank.account_type && (
              <Text style={s.bankLine}>
                {bank.account_type} {bank.account_number ?? ""}
              </Text>
            )}
            {bank.account_holder && (
              <Text style={s.bankLine}>口座名義: {bank.account_holder}</Text>
            )}
          </View>
        )}

        {/* Note */}
        {doc.note && (
          <View style={s.noteSection}>
            <Text style={s.noteLabel}>備考</Text>
            <Text style={s.noteText}>{doc.note}</Text>
          </View>
        )}

        {/* Compliance */}
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
