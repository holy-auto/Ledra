import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSignedAssetUrl } from "@/lib/signedUrl";
import { DEFAULT_LAYOUT, type LayoutConfig, mergeLayout } from "@/types/documentTemplate";

export { DEFAULT_LAYOUT, mergeLayout };
export type { LayoutConfig };

const NOTO_SANS_JP = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-400-normal.ttf";
const NOTO_SANS_JP_BOLD = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-700-normal.ttf";

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

/** 帳票種別ごとの挨拶文 */
const DOC_TYPE_GREETINGS: Record<string, string> = {
  estimate: "下記のとおりお見積り申し上げます。",
  invoice: "下記のとおりご請求申し上げます。",
  consolidated_invoice: "下記のとおりご請求申し上げます。",
  delivery: "下記のとおり納品いたしました。",
  purchase_order: "下記のとおり発注いたします。",
  order_confirmation: "下記のとおりご注文を承りました。",
  inspection: "下記のとおり検収いたしました。",
  receipt: "下記のとおり領収いたしました。",
};

/** 発行日ラベルも書類種別で分ける */
const ISSUED_LABEL: Record<string, string> = {
  estimate: "見積日",
  invoice: "請求日",
  consolidated_invoice: "請求日",
  delivery: "納品日",
  purchase_order: "発注日",
  order_confirmation: "受注日",
  inspection: "検収日",
  receipt: "領収日",
};

type DocumentItem = {
  description: string;
  quantity: number;
  unit?: string;
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
  recipient_honorific?: string | null;
  recipient_postal_code?: string | null;
  recipient_address?: string | null;
  recipient_phone?: string | null;
  subject?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  payment_terms?: string | null;
  delivery_date?: string | null;
  template_id?: string | null;
};

export type TenantForDocPdf = {
  name: string;
  address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  postal_code?: string | null;
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

function fmtPeriod(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start && !end) return null;
  if (start && end) return `${fmtDate(start)} 〜 ${fmtDate(end)}`;
  return fmtDate(start || end);
}

function buildStyles(layout: LayoutConfig) {
  return StyleSheet.create({
    page: {
      padding: 36,
      fontSize: layout.fontSizeBase,
      fontFamily: "NotoSansJP",
    },
    titleRow: {
      alignItems: "center",
      marginBottom: 10,
    },
    title: {
      fontSize: layout.title.fontSize,
      fontWeight: 700,
      letterSpacing: layout.title.spacing,
      textAlign: layout.title.align,
    },
    metaRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 12,
    },
    metaBox: { fontSize: 9, color: "#444", textAlign: "right" },

    mainRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 14,
    },
    leftCol: { flex: 1, paddingRight: 20 },
    rightCol: { width: 220 },

    recipientName: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
    recipientLine: { fontSize: 9, color: "#444", marginTop: 1 },
    greeting: { fontSize: 9, color: "#444", marginTop: 10, marginBottom: 10 },

    summaryTable: { marginBottom: 10 },
    summaryRow: {
      flexDirection: "row",
      paddingVertical: 3,
      borderBottomWidth: 0.5,
      borderBottomColor: "#ddd",
    },
    summaryLabel: { width: 70, fontSize: 9, fontWeight: 700, color: "#444" },
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
    totalBigLabel: {
      fontSize: 10,
      fontWeight: 700,
      color: layout.colors.primary,
    },
    totalBigValue: { fontSize: 22, fontWeight: 700 },
    totalBigUnit: { fontSize: 10, color: "#666" },

    issuerAlignLeft: { alignItems: "flex-start" },
    issuerAlignRight: { alignItems: "flex-end" },
    logo: { height: layout.logo.height, marginBottom: 8 },
    senderName: { fontSize: 11, fontWeight: 700 },
    senderLine: { fontSize: 9, color: "#444", marginTop: 1 },
    sealImage: {
      width: layout.seal.size,
      height: layout.seal.size,
      marginTop: 8,
    },
    sealPlaceholder: {
      width: layout.seal.size - 8,
      height: layout.seal.size - 8,
      borderWidth: 1,
      borderColor: layout.colors.primary,
      borderRadius: (layout.seal.size - 8) / 2,
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    sealText: { fontSize: 14, color: layout.colors.primary },

    tableHead: {
      flexDirection: "row",
      borderBottomWidth: 1.5,
      borderBottomColor: layout.colors.headerRule,
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
    colQty: { width: 40, textAlign: "right" },
    colUnit: { width: 32, textAlign: "center" },
    colPrice: { width: 68, textAlign: "right" },
    colAmount: { width: 80, textAlign: "right" },
    thText: { fontSize: 8, color: "#666", fontWeight: 700 },

    totalsWrap: { alignItems: "flex-end", marginTop: 12 },
    totalsBox: { width: 220 },
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
}

export async function renderDocumentPdf(
  doc: DocForPdf,
  tenant: TenantForDocPdf,
  customerName: string | null,
  layoutOverride?: Partial<LayoutConfig>,
) {
  const layout: LayoutConfig = mergeLayout(DEFAULT_LAYOUT, layoutOverride);
  const s = buildStyles(layout);

  const baseLabel = DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type;
  const docLabel = layout.title.prefix ? `御${baseLabel}` : baseLabel;
  const issuedLabel = ISSUED_LABEL[doc.doc_type] ?? "発行日";
  const greeting = DOC_TYPE_GREETINGS[doc.doc_type] ?? "下記のとおりご案内申し上げます。";

  let logoUrl: string | null = null;
  try {
    logoUrl =
      doc.show_logo && layout.logo.show && tenant.logo_asset_path
        ? await createSignedAssetUrl(tenant.logo_asset_path, 3600)
        : null;
  } catch {
    logoUrl = null;
  }

  let sealUrl: string | null = null;
  try {
    sealUrl =
      doc.show_seal && layout.seal.show && tenant.company_seal_path
        ? await createSignedAssetUrl(tenant.company_seal_path, 3600)
        : null;
  } catch {
    sealUrl = null;
  }

  const items = doc.items_json ?? [];
  const recipientName = doc.recipient_name || customerName;
  const honorific = doc.recipient_honorific ?? "御中";
  const bank = tenant.bank_info;
  const period = fmtPeriod(doc.period_start, doc.period_end);

  const issuerBlock = (
    <View style={layout.issuer.align === "right" ? s.issuerAlignRight : s.issuerAlignLeft}>
      {logoUrl && <Image src={logoUrl} style={s.logo} />}
      <Text style={s.senderName}>{tenant.name}</Text>
      {tenant.postal_code && <Text style={s.senderLine}>〒{tenant.postal_code}</Text>}
      {tenant.address && <Text style={s.senderLine}>{tenant.address}</Text>}
      {tenant.contact_phone && <Text style={s.senderLine}>TEL：{tenant.contact_phone}</Text>}
      {tenant.contact_email && <Text style={s.senderLine}>{tenant.contact_email}</Text>}
      {doc.is_invoice_compliant && tenant.registration_number && (
        <Text style={s.senderLine}>登録番号：{tenant.registration_number}</Text>
      )}

      {sealUrl ? (
        <Image src={sealUrl} style={s.sealImage} />
      ) : doc.show_seal && layout.seal.show ? (
        <View style={s.sealPlaceholder}>
          <Text style={s.sealText}>印</Text>
        </View>
      ) : null}
    </View>
  );

  const recipientBlock = (
    <View>
      {recipientName && (
        <Text style={s.recipientName}>
          {recipientName}
          {honorific ? ` ${honorific}` : ""}
        </Text>
      )}
      {layout.recipient.showPostalCode && doc.recipient_postal_code && (
        <Text style={s.recipientLine}>〒{doc.recipient_postal_code}</Text>
      )}
      {layout.recipient.showAddress && doc.recipient_address && (
        <Text style={s.recipientLine}>{doc.recipient_address}</Text>
      )}
      {layout.recipient.showPhone && doc.recipient_phone && (
        <Text style={s.recipientLine}>TEL：{doc.recipient_phone}</Text>
      )}

      <Text style={s.greeting}>{greeting}</Text>

      <View style={s.summaryTable}>
        {doc.subject && (
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>件名</Text>
            <Text style={s.summaryValue}>{doc.subject}</Text>
          </View>
        )}
        {period && (
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>期間</Text>
            <Text style={s.summaryValue}>{period}</Text>
          </View>
        )}
        {doc.payment_terms && (
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>支払条件</Text>
            <Text style={s.summaryValue}>{doc.payment_terms}</Text>
          </View>
        )}
        {doc.delivery_date && (
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>納期日</Text>
            <Text style={s.summaryValue}>{fmtDate(doc.delivery_date)}</Text>
          </View>
        )}
        {doc.due_date && (
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>支払期限</Text>
            <Text style={s.summaryValue}>{fmtDate(doc.due_date)}</Text>
          </View>
        )}
        {doc.show_bank_info && bank && bank.bank_name && (
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>振込先</Text>
            <Text style={s.summaryValue}>
              {bank.bank_name}
              {bank.branch_name ? ` ${bank.branch_name}` : ""}
              {bank.account_type ? ` ${bank.account_type}` : ""}
              {bank.account_number ? ` ${bank.account_number}` : ""}
              {bank.account_holder ? ` ${bank.account_holder}` : ""}
            </Text>
          </View>
        )}
      </View>

      <View style={s.totalBig}>
        <Text style={s.totalBigLabel}>合計金額</Text>
        <Text style={s.totalBigValue}>{fmtTotal(doc.total)}</Text>
        <Text style={s.totalBigUnit}>円（税込）</Text>
      </View>
    </View>
  );

  const leftIsRecipient = layout.issuer.position === "top-right";

  const pdfDoc = (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.titleRow}>
          <Text style={s.title}>{docLabel}</Text>
        </View>

        <View style={s.metaRow}>
          <View style={s.metaBox}>
            <Text>No：{doc.doc_number}</Text>
            <Text>
              {issuedLabel}：{fmtDate(doc.issued_at)}
            </Text>
          </View>
        </View>

        <View style={s.mainRow}>
          <View style={s.leftCol}>{leftIsRecipient ? recipientBlock : issuerBlock}</View>
          <View style={s.rightCol}>{leftIsRecipient ? issuerBlock : recipientBlock}</View>
        </View>

        <View style={s.tableHead}>
          <Text style={{ ...s.thText, ...s.colDesc }}>摘要</Text>
          <Text style={{ ...s.thText, ...s.colQty }}>数量</Text>
          {layout.items.showUnit && <Text style={{ ...s.thText, ...s.colUnit }}>単位</Text>}
          <Text style={{ ...s.thText, ...s.colPrice }}>単価</Text>
          <Text style={{ ...s.thText, ...s.colAmount }}>金額</Text>
        </View>
        {items.map((item, idx) => (
          <View key={idx} style={s.tableRow}>
            <Text style={s.colDesc}>
              {item.description || "-"}
              {layout.items.showTaxLabel && item.tax_category === 8 ? " ※軽減" : ""}
            </Text>
            <Text style={s.colQty}>{item.quantity}</Text>
            {layout.items.showUnit && <Text style={s.colUnit}>{item.unit ?? ""}</Text>}
            <Text style={s.colPrice}>{fmtJpy(item.unit_price)}</Text>
            <Text style={s.colAmount}>{fmtJpy(item.amount)}</Text>
          </View>
        ))}

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

        {doc.note && (
          <View style={s.noteSection}>
            <Text style={s.noteLabel}>備考</Text>
            <Text style={s.noteText}>{doc.note}</Text>
          </View>
        )}

        {doc.is_invoice_compliant && (
          <View style={s.compliance}>
            <Text>※ この書類は適格請求書等保存方式（インボイス制度）に対応しています。</Text>
          </View>
        )}
      </Page>
    </Document>
  );

  return await renderToBuffer(pdfDoc);
}
