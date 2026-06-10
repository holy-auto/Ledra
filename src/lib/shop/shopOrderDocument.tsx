/**
 * ショップ注文の帳票 PDF レンダラ（請求書 / 納品書 / 領収書）。
 *
 * 運営（Ledra）が販売するショップ商品（NFCタグ・グッズ等）の注文に対し、
 * 共通レイアウトで 3 種の帳票を出力する。発行元（売り手）は運営テナント、
 * 宛先（買い手）は注文を行ったテナント。
 *
 * 既存の請求書 PDF 基盤（@react-pdf/renderer + Noto Sans JP）を踏襲しつつ、
 * 帳票の種別ごとに表題・前文・日付・支払/領収まわりの差分のみ切り替える。
 * フォントは他モジュールの登録と衝突しないよう専用 family 名で登録する。
 */
import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { createSignedAssetUrl } from "@/lib/signedUrl";
import { notoSansJpDataUrl } from "@/lib/marketing/pdfFonts";
import { isValidRegistrationNumber } from "@/lib/invoice/taxBreakdown";
import type { TenantForPdf } from "@/lib/pdfInvoice";

// 専用 family 名で登録（"NotoSansJP" は他所が CDN 版で登録しているため衝突回避）。
Font.register({
  family: "NotoSansJPShop",
  fonts: [
    { src: notoSansJpDataUrl(400), fontWeight: 400 },
    { src: notoSansJpDataUrl(700), fontWeight: 700 },
  ],
});

export type ShopDocumentKind = "invoice" | "delivery" | "receipt";

export const SHOP_DOCUMENT_LABELS: Record<ShopDocumentKind, string> = {
  invoice: "請求書",
  delivery: "納品書",
  receipt: "領収書",
};

export const SHOP_DOCUMENT_KINDS = Object.keys(SHOP_DOCUMENT_LABELS) as ShopDocumentKind[];

export function isShopDocumentKind(v: unknown): v is ShopDocumentKind {
  return typeof v === "string" && (SHOP_DOCUMENT_KINDS as string[]).includes(v);
}

/** 帳票に必要な注文ヘッダ情報。 */
export type ShopOrderForDocument = {
  order_number: string;
  subtotal: number;
  tax: number;
  total: number;
  note: string | null;
  created_at: string;
  shipped_at: string | null;
  completed_at: string | null;
};

/** 帳票に必要な明細情報。tax_rate は小数（0.1 = 10%）。 */
export type ShopOrderItemForDocument = {
  product_name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  amount: number;
};

/** 発行元（運営テナント）情報。請求書 PDF と同形。 */
export type ShopDocumentSender = TenantForPdf;

function fmtJpy(n: number | null | undefined): string {
  if (n == null) return "-";
  return `¥${n.toLocaleString("ja-JP")}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("ja-JP");
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("ja-JP");
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

type BreakdownEntry = { rate: number; subtotal: number; tax: number };

/** 税率（%）ごとに小計・消費税を集計。明細の tax_rate（小数）を百分率へ変換する。 */
function buildBreakdown(items: ShopOrderItemForDocument[]): BreakdownEntry[] {
  const map = new Map<number, BreakdownEntry>();
  for (const it of items) {
    const ratePct = Math.round((it.tax_rate ?? 0) * 100);
    const e = map.get(ratePct) ?? { rate: ratePct, subtotal: 0, tax: 0 };
    e.subtotal += it.amount;
    e.tax += Math.floor(it.amount * (it.tax_rate ?? 0));
    map.set(ratePct, e);
  }
  return [...map.values()].sort((a, b) => b.rate - a.rate);
}

const KIND_META: Record<ShopDocumentKind, { title: string; lead: string; dateLabel: string }> = {
  invoice: { title: "請 求 書", lead: "下記のとおり、御請求申し上げます。", dateLabel: "請求日" },
  delivery: { title: "納 品 書", lead: "下記のとおり納品いたします。", dateLabel: "納品日" },
  receipt: { title: "領 収 書", lead: "下記のとおり、正に領収いたしました。", dateLabel: "発行日" },
};

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "NotoSansJPShop" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, letterSpacing: 6 },
  metaRight: { textAlign: "right", fontSize: 9, color: "#444" },
  mainRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  leftCol: { flex: 1, paddingRight: 20 },
  rightCol: { width: 220, alignItems: "flex-end" },
  recipientName: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    paddingBottom: 4,
  },
  lead: { fontSize: 9, color: "#444", marginBottom: 12 },
  summaryTable: { marginBottom: 12 },
  summaryRow: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#ddd" },
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
  proviso: { fontSize: 9, color: "#444", marginTop: 8 },
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
  stampBox: {
    width: 78,
    height: 78,
    borderWidth: 1,
    borderColor: "#888",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  stampText: { fontSize: 8, color: "#888" },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: "#333",
    paddingBottom: 4,
    marginTop: 8,
  },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 5 },
  colDesc: { flex: 3, paddingRight: 4 },
  colQty: { width: 50, textAlign: "right" },
  colPrice: { width: 70, textAlign: "right" },
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
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, marginTop: 2 },
  grandTotalLabel: { fontSize: 12, fontWeight: 700 },
  grandTotalValue: { fontSize: 12, fontWeight: 700 },
  noteSection: { borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 10, marginTop: 14 },
  noteLabel: { fontSize: 8, color: "#888" },
  noteText: { fontSize: 9, color: "#444", marginTop: 2 },
  compliance: { borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 8, marginTop: 10, fontSize: 7, color: "#888" },
});

/** ショップ注文の帳票 PDF を生成し Buffer を返す。 */
export async function renderShopOrderDocument(args: {
  kind: ShopDocumentKind;
  order: ShopOrderForDocument;
  items: ShopOrderItemForDocument[];
  sender: ShopDocumentSender;
  recipientName: string | null;
}): Promise<Buffer> {
  const { kind, order, items, sender, recipientName } = args;
  const meta = KIND_META[kind];

  // ロゴ・角印は失敗しても帳票自体は生成する（best-effort）。
  let logoUrl: string | null = null;
  if (sender.logo_asset_path) {
    try {
      logoUrl = await createSignedAssetUrl(sender.logo_asset_path, 3600);
    } catch {
      logoUrl = null;
    }
  }
  let sealUrl: string | null = null;
  if (sender.company_seal_path) {
    try {
      sealUrl = await createSignedAssetUrl(sender.company_seal_path, 3600);
    } catch {
      sealUrl = null;
    }
  }

  const breakdown = buildBreakdown(items);
  const showMultiRate = breakdown.length > 1;
  const hasReducedItem = items.some((it) => Math.round((it.tax_rate ?? 0) * 100) === 8);
  const isQualified = isValidRegistrationNumber(sender.registration_number);
  const bank = sender.bank_info;

  const dateValue =
    kind === "delivery"
      ? (order.shipped_at ?? order.created_at)
      : kind === "receipt"
        ? (order.completed_at ?? order.created_at)
        : order.created_at;
  const dueDate = kind === "invoice" ? addDays(order.created_at, 30) : null;
  // 領収書は紙面提出時の収入印紙欄を慣例的に設ける（5万円以上）。電子発行では印紙税は不要。
  const showStampBox = kind === "receipt" && order.total >= 50000;

  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── 表題 / No・日付 ── */}
        <View style={s.header}>
          <Text style={s.title}>{meta.title}</Text>
          <View style={s.metaRight}>
            <Text>No：{order.order_number}</Text>
            <Text>
              {meta.dateLabel}：{fmtDate(dateValue)}
            </Text>
          </View>
        </View>

        {/* ── 宛先・サマリー / 発行元 ── */}
        <View style={s.mainRow}>
          <View style={s.leftCol}>
            {recipientName && <Text style={s.recipientName}>{recipientName} 御中</Text>}
            {meta.lead ? <Text style={s.lead}>{meta.lead}</Text> : null}

            <View style={s.summaryTable}>
              {kind === "invoice" && dueDate && (
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>支払期限</Text>
                  <Text style={s.summaryValue}>{fmtDate(dueDate)}</Text>
                </View>
              )}
              {kind === "invoice" && bank && bank.bank_name && (
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

            {/* 大きな金額表示（請求書＝合計金額 / 領収書＝領収金額）。納品書は省略。 */}
            {kind !== "delivery" && (
              <View style={s.totalBig}>
                <Text style={s.totalBigLabel}>{kind === "receipt" ? "領収金額" : "合計金額"}</Text>
                <Text style={s.totalBigValue}>{fmtNum(order.total)}</Text>
                <Text style={s.totalBigUnit}>円（税込）</Text>
              </View>
            )}
            {kind === "receipt" && <Text style={s.proviso}>但し ショップ商品代として</Text>}
          </View>

          <View style={s.rightCol}>
            {logoUrl && <Image src={logoUrl} style={s.logo} />}
            <Text style={s.senderName}>{sender.name}</Text>
            {sender.address && <Text style={s.senderLine}>{sender.address}</Text>}
            {sender.contact_phone && <Text style={s.senderLine}>TEL：{sender.contact_phone}</Text>}
            {sender.contact_email && <Text style={s.senderLine}>{sender.contact_email}</Text>}
            {isQualified && <Text style={s.senderLine}>登録番号：{sender.registration_number}</Text>}
            {sealUrl ? (
              <Image src={sealUrl} style={s.sealImage} />
            ) : (
              <View style={s.sealPlaceholder}>
                <Text style={s.sealText}>印</Text>
              </View>
            )}
            {showStampBox && (
              <View style={s.stampBox}>
                <Text style={s.stampText}>収入印紙</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── 明細 ── */}
        <View style={s.tableHead}>
          <Text style={{ ...s.thText, ...s.colDesc }}>摘要</Text>
          <Text style={{ ...s.thText, ...s.colQty }}>数量</Text>
          <Text style={{ ...s.thText, ...s.colPrice }}>単価</Text>
          <Text style={{ ...s.thText, ...s.colAmount }}>金額</Text>
        </View>
        {items.map((item, idx) => {
          const reduced = Math.round((item.tax_rate ?? 0) * 100) === 8;
          return (
            <View key={idx} style={s.tableRow}>
              <Text style={s.colDesc}>
                {reduced ? "※ " : ""}
                {item.product_name || "-"}
              </Text>
              <Text style={s.colQty}>{item.quantity}</Text>
              <Text style={s.colPrice}>{fmtJpy(item.unit_price)}</Text>
              <Text style={s.colAmount}>{fmtJpy(item.amount)}</Text>
            </View>
          );
        })}
        {hasReducedItem && <Text style={{ fontSize: 8, color: "#666", marginTop: 4 }}>※ は軽減税率 (8%) 対象品目</Text>}

        {/* ── 合計 ── */}
        <View style={s.totalsWrap}>
          <View style={s.totalsBox}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>小計</Text>
              <Text style={s.totalValue}>{fmtJpy(order.subtotal)}</Text>
            </View>
            {showMultiRate ? (
              breakdown.map((b) => (
                <View key={`tax-${b.rate}`} style={s.totalRow}>
                  <Text style={s.totalLabel}>消費税（{b.rate}%）</Text>
                  <Text style={s.totalValue}>{fmtJpy(b.tax)}</Text>
                </View>
              ))
            ) : (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>消費税（{breakdown[0]?.rate ?? 10}%）</Text>
                <Text style={s.totalValue}>{fmtJpy(order.tax)}</Text>
              </View>
            )}
            <View style={s.grandTotalRow}>
              <Text style={s.grandTotalLabel}>合計</Text>
              <Text style={s.grandTotalValue}>{fmtJpy(order.total)}</Text>
            </View>
          </View>
        </View>

        {/* ── 備考 ── */}
        {order.note && (
          <View style={s.noteSection}>
            <Text style={s.noteLabel}>備考</Text>
            <Text style={s.noteText}>{order.note}</Text>
          </View>
        )}

        {/* ── インボイス制度対応の注記（請求書のみ・適格時） ── */}
        {kind === "invoice" && isQualified && (
          <View style={s.compliance}>
            <Text>※ この書類は適格請求書等保存方式（インボイス制度）に対応しています。</Text>
          </View>
        )}
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}
