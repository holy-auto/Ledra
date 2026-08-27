import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSignedAssetUrl } from "@/lib/signedUrl";
import { notoSansJpDataUrl } from "@/lib/marketing/pdfFonts";
import { fmtJpy, fmtDate, fmtTotal } from "@/lib/pdf/format";
import { itemContentLines } from "@/lib/documents/itemDisplay";
import { DEFAULT_LAYOUT, type LayoutConfig, mergeLayout } from "@/types/documentTemplate";
import { hasNoHonorificPrefix } from "@/types/document";
import {
  buildTaxBreakdown,
  hasMultipleRates,
  isValidRegistrationNumber,
  totalSubtotal,
  totalTax,
  type TaxBreakdownEntry,
} from "@/lib/invoice/taxBreakdown";

export { DEFAULT_LAYOUT, mergeLayout };
export type { LayoutConfig };

// バンドル済み Noto Sans JP (public/fonts) を data URL として登録する。
// 外部 CDN (@latest) への実行時フェッチを排し、供給元の改変・停止リスクを断つ。
Font.register({
  family: "NotoSansJP",
  fonts: [
    { src: notoSansJpDataUrl(400), fontWeight: 400 },
    { src: notoSansJpDataUrl(700), fontWeight: 700 },
  ],
});

/** 帳票種別 → 表示名。プレビュー用スクリプトが種別一覧の唯一の出所として参照する。 */
export const DOC_TYPE_LABELS: Record<string, string> = {
  estimate: "見積書",
  delivery: "納品書",
  purchase_order: "発注書",
  order_confirmation: "発注請書",
  inspection: "検収書",
  receipt: "領収書",
  invoice: "請求書",
  consolidated_invoice: "合算請求書",
  staff_invoice: "外注請求書",
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
  staff_invoice: "下記のとおり外注費をご請求申し上げます。",
};

/** 発行日ラベルも書類種別で分ける */
const ISSUED_LABEL: Record<string, string> = {
  estimate: "見積日",
  invoice: "請求日",
  consolidated_invoice: "請求日",
  staff_invoice: "請求日",
  delivery: "納品日",
  purchase_order: "発注日",
  order_confirmation: "受注日",
  inspection: "検収日",
  receipt: "領収日",
};

type DocumentItem = {
  /** "item"（既定）/ "heading"（見出し行）/ "subtotal"（小計行） */
  item_type?: "item" | "heading" | "subtotal";
  description: string;
  /** 品番。品目マスタ(menu_items)の item_code。内容が空でも品番があれば摘要へ出す。 */
  item_code?: string | null;
  quantity: number;
  unit?: string;
  unit_price: number;
  amount: number;
  /** 軽減税率対象の場合は 8、標準は 10 */
  tax_category?: number;
  /** 行ごとの税率 (10/8/0)。未指定なら doc.tax_rate */
  tax_rate?: number | null;
  is_reduced_rate?: boolean | null;
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
  tax_breakdown?: TaxBreakdownEntry[] | null;
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
  vehicle_info_json?: { model?: string; plate?: string; vin?: string } | null;
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
    headingRow: {
      flexDirection: "row",
      borderBottomWidth: 0.5,
      borderBottomColor: "#ddd",
      paddingTop: 8,
      paddingBottom: 4,
      backgroundColor: "#f5f5f5",
    },
    headingText: { fontSize: 9, fontWeight: 700, color: "#222", paddingHorizontal: 4 },
    subtotalRow: {
      flexDirection: "row",
      borderBottomWidth: 0.5,
      borderBottomColor: "#ccc",
      paddingVertical: 5,
    },
    subtotalLabel: { flex: 1, fontWeight: 700, color: "#333", textAlign: "right", paddingRight: 8 },
    subtotalValue: { width: 80, textAlign: "right", fontWeight: 700, color: "#333" },
    colDesc: { flex: 3, paddingRight: 4 },
    colDescCode: { fontSize: 7, color: "#888" },
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
  const docLabel = layout.title.prefix && !hasNoHonorificPrefix(doc.doc_type) ? `御${baseLabel}` : baseLabel;
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
  const vehicleInfo = doc.vehicle_info_json ?? null;
  const vehicleLine = vehicleInfo ? [vehicleInfo.model, vehicleInfo.plate].filter(Boolean).join(" / ") || null : null;

  const productItems = items.filter((it) => (it.item_type ?? "item") === "item");
  const breakdown =
    doc.tax_breakdown && doc.tax_breakdown.length > 0
      ? doc.tax_breakdown
      : buildTaxBreakdown(
          productItems.map((it) => ({
            amount: it.amount,
            quantity: it.quantity,
            unit_price: it.unit_price,
            tax_rate: it.tax_rate ?? (it.tax_category === 8 ? 8 : null),
            is_reduced_rate: it.is_reduced_rate ?? it.tax_category === 8,
          })),
          doc.tax_rate ?? 10,
        );
  const showMultiRate = hasMultipleRates(breakdown);
  // 表示用の小計・消費税・合計は breakdown を唯一の出所として導出し、税率別の内訳行と
  // 必ず一致させる (stored subtotal/tax/total が items_json とズレていても PDF は整合)。
  // 決済等で使う stored total (doc.total) は変更しない — PDF の表示だけ整える。
  const displayedSubtotal = totalSubtotal(breakdown);
  const displayedTax = totalTax(breakdown);
  const displayedTotal = displayedSubtotal + displayedTax;
  const hasReducedItem = productItems.some((it) => it.is_reduced_rate || it.tax_category === 8 || it.tax_rate === 8);
  const isQualifiedInvoice = !!doc.is_invoice_compliant && isValidRegistrationNumber(tenant.registration_number);

  const issuerBlock = (
    <View style={layout.issuer.align === "right" ? s.issuerAlignRight : s.issuerAlignLeft}>
      {logoUrl && <Image src={logoUrl} style={s.logo} />}
      <Text style={s.senderName}>{tenant.name}</Text>
      {tenant.postal_code && <Text style={s.senderLine}>〒{tenant.postal_code}</Text>}
      {tenant.address && <Text style={s.senderLine}>{tenant.address}</Text>}
      {tenant.contact_phone && <Text style={s.senderLine}>TEL：{tenant.contact_phone}</Text>}
      {tenant.contact_email && <Text style={s.senderLine}>{tenant.contact_email}</Text>}
      {isQualifiedInvoice && <Text style={s.senderLine}>登録番号：{tenant.registration_number}</Text>}

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
        {vehicleLine && (
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>車両</Text>
            <Text style={s.summaryValue}>{vehicleLine}</Text>
          </View>
        )}
        {vehicleInfo?.vin && (
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>車台番号</Text>
            <Text style={s.summaryValue}>{vehicleInfo.vin}</Text>
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
        <Text style={s.totalBigValue}>{fmtTotal(displayedTotal)}</Text>
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
        {items.map((item, idx) => {
          const type = item.item_type ?? "item";
          const content = itemContentLines(item);
          if (type === "heading") {
            return (
              <View key={idx} style={s.headingRow}>
                <Text style={s.headingText}>{content.primary}</Text>
              </View>
            );
          }
          if (type === "subtotal") {
            return (
              <View key={idx} style={s.subtotalRow}>
                <Text style={s.subtotalLabel}>{item.description || "小計"}</Text>
                <Text style={s.subtotalValue}>{fmtJpy(item.amount)}</Text>
              </View>
            );
          }
          return (
            <View key={idx} style={s.tableRow}>
              <Text style={s.colDesc}>
                {content.primary}
                {layout.items.showTaxLabel && item.tax_category === 8 ? " ※軽減" : ""}
                {content.code ? (
                  <Text style={s.colDescCode}>
                    {"\n"}品番: {content.code}
                  </Text>
                ) : (
                  ""
                )}
              </Text>
              <Text style={s.colQty}>{item.quantity}</Text>
              {layout.items.showUnit && <Text style={s.colUnit}>{item.unit ?? ""}</Text>}
              <Text style={s.colPrice}>{fmtJpy(item.unit_price)}</Text>
              <Text style={s.colAmount}>{fmtJpy(item.amount)}</Text>
            </View>
          );
        })}

        {hasReducedItem && <Text style={{ fontSize: 8, color: "#666", marginTop: 4 }}>※ は軽減税率 (8%) 対象品目</Text>}

        <View style={s.totalsWrap}>
          <View style={s.totalsBox}>
            {showMultiRate ? (
              <>
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>小計</Text>
                  <Text style={s.totalValue}>{fmtJpy(displayedSubtotal)}</Text>
                </View>
                {breakdown.map((b) => (
                  <View key={`sub-${b.rate}`} style={s.totalRow}>
                    <Text style={s.totalLabel}>{b.rate === 8 ? "  内 軽減税率対象" : `  内 ${b.rate}%対象`}</Text>
                    <Text style={s.totalValue}>{fmtJpy(b.subtotal)}</Text>
                  </View>
                ))}
                {breakdown.map((b) => (
                  <View key={`tax-${b.rate}`} style={s.totalRow}>
                    <Text style={s.totalLabel}>消費税（{b.rate}%）</Text>
                    <Text style={s.totalValue}>{fmtJpy(b.tax)}</Text>
                  </View>
                ))}
                <View style={s.grandTotalRow}>
                  <Text style={s.grandTotalLabel}>合計</Text>
                  <Text style={s.grandTotalValue}>{fmtJpy(displayedTotal)}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>小計</Text>
                  <Text style={s.totalValue}>{fmtJpy(displayedSubtotal)}</Text>
                </View>
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>消費税（{breakdown[0]?.rate ?? doc.tax_rate}%）</Text>
                  <Text style={s.totalValue}>{fmtJpy(displayedTax)}</Text>
                </View>
                <View style={s.grandTotalRow}>
                  <Text style={s.grandTotalLabel}>合計</Text>
                  <Text style={s.grandTotalValue}>{fmtJpy(displayedTotal)}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {doc.note && (
          <View style={s.noteSection}>
            <Text style={s.noteLabel}>備考</Text>
            <Text style={s.noteText}>{doc.note}</Text>
          </View>
        )}

        {isQualifiedInvoice && (
          <View style={s.compliance}>
            <Text>※ この書類は適格請求書等保存方式（インボイス制度）に対応しています。</Text>
          </View>
        )}
      </Page>
    </Document>
  );

  return await renderToBuffer(pdfDoc);
}
