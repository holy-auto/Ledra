"use client";

import type { LayoutConfig } from "@/types/documentTemplate";
import type { DocType } from "@/types/document";

const DOC_TYPE_LABELS: Record<DocType, string> = {
  estimate: "見積書",
  delivery: "納品書",
  purchase_order: "発注書",
  order_confirmation: "発注請書",
  inspection: "検収書",
  receipt: "領収書",
  invoice: "請求書",
  consolidated_invoice: "合算請求書",
};

const GREETINGS: Record<DocType, string> = {
  estimate: "下記のとおりお見積り申し上げます。",
  invoice: "下記のとおりご請求申し上げます。",
  consolidated_invoice: "下記のとおりご請求申し上げます。",
  delivery: "下記のとおり納品いたしました。",
  purchase_order: "下記のとおり発注いたします。",
  order_confirmation: "下記のとおりご注文を承りました。",
  inspection: "下記のとおり検収いたしました。",
  receipt: "下記のとおり領収いたしました。",
};

const ISSUED_LABEL: Record<DocType, string> = {
  estimate: "見積日",
  invoice: "請求日",
  consolidated_invoice: "請求日",
  delivery: "納品日",
  purchase_order: "発注日",
  order_confirmation: "受注日",
  inspection: "検収日",
  receipt: "領収日",
};

/**
 * HTML live preview of a document template.
 *
 * Mirrors the layout from src/lib/pdfDocument.tsx as closely as practical.
 * Uses sample recipient/issuer/items data so the user can see the effect of
 * layout changes in real time without needing a backend round-trip.
 */
export default function LayoutPreview({ layout, docType }: { layout: LayoutConfig; docType: DocType }) {
  const label = layout.title.prefix ? `御${DOC_TYPE_LABELS[docType]}` : DOC_TYPE_LABELS[docType];

  const issuerBlock = (
    <div
      style={{
        textAlign: layout.issuer.align === "right" ? "right" : "left",
        fontSize: layout.fontSizeBase + 1,
      }}
    >
      {layout.logo.show && (
        <div
          style={{
            height: layout.logo.height * 0.5, // scaled for preview
            display: "flex",
            alignItems: layout.issuer.align === "right" ? "flex-end" : "flex-start",
            justifyContent: layout.issuer.align === "right" ? "flex-end" : "flex-start",
            marginBottom: 6,
          }}
        >
          <div
            style={{
              height: "100%",
              aspectRatio: "2 / 1",
              background: "linear-gradient(135deg, #d4f5dd 0%, #4caf50 50%, #2e7d32 100%)",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: 700,
              fontSize: layout.fontSizeBase,
            }}
          >
            LOGO
          </div>
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: layout.fontSizeBase + 1 }}>株式会社サンプル商事</div>
      <div style={{ color: "#666", fontSize: layout.fontSizeBase - 1 }}>〒100-0001</div>
      <div style={{ color: "#666", fontSize: layout.fontSizeBase - 1 }}>東京都千代田区千代田1-1</div>
      <div style={{ color: "#666", fontSize: layout.fontSizeBase - 1 }}>TEL：03-0000-0000</div>
      <div style={{ color: "#666", fontSize: layout.fontSizeBase - 1 }}>info@example.com</div>
      {layout.seal.show && (
        <div
          style={{
            display: "inline-flex",
            width: layout.seal.size * 0.6,
            height: layout.seal.size * 0.6,
            borderRadius: "50%",
            border: `2px dashed ${layout.colors.primary}`,
            color: layout.colors.primary,
            alignItems: "center",
            justifyContent: "center",
            fontSize: layout.fontSizeBase + 2,
            marginTop: 8,
          }}
        >
          印
        </div>
      )}
    </div>
  );

  const recipientBlock = (
    <div style={{ fontSize: layout.fontSizeBase + 1 }}>
      <div style={{ fontWeight: 700, fontSize: layout.fontSizeBase + 3 }}>株式会社サンプル 御中</div>
      {layout.recipient.showPostalCode && (
        <div style={{ color: "#666", fontSize: layout.fontSizeBase - 1 }}>〒150-0001</div>
      )}
      {layout.recipient.showAddress && (
        <div style={{ color: "#666", fontSize: layout.fontSizeBase - 1 }}>東京都渋谷区神宮前1-2-3</div>
      )}
      {layout.recipient.showPhone && (
        <div style={{ color: "#666", fontSize: layout.fontSizeBase - 1 }}>TEL：03-1111-2222</div>
      )}
      <div style={{ color: "#666", marginTop: 8, fontSize: layout.fontSizeBase - 1 }}>{GREETINGS[docType]}</div>
      <div style={{ marginTop: 10 }}>
        <SummaryRow label="件名" value="○○商品 一式" fontSize={layout.fontSizeBase - 1} />
        <SummaryRow label="期間" value="2026/04/01 〜 2026/04/30" fontSize={layout.fontSizeBase - 1} />
        <SummaryRow label="支払条件" value="月末締翌月末払" fontSize={layout.fontSizeBase - 1} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginTop: 10,
          paddingTop: 8,
          borderTop: "1px solid #333",
        }}
      >
        <div style={{ color: layout.colors.primary, fontWeight: 700 }}>合計金額</div>
        <div style={{ fontSize: layout.fontSizeBase + 12, fontWeight: 700 }}>115,885</div>
        <div style={{ color: "#666" }}>円（税込）</div>
      </div>
    </div>
  );

  const leftIsRecipient = layout.issuer.position === "top-right";

  return (
    <div
      style={{
        border: "1px solid var(--color-border-subtle, #e5e7eb)",
        borderRadius: 8,
        padding: 24,
        background: "white",
        color: "#111",
        fontSize: layout.fontSizeBase,
        lineHeight: 1.5,
      }}
    >
      {/* title */}
      <div
        style={{
          textAlign: layout.title.align,
          fontWeight: 700,
          fontSize: layout.title.fontSize,
          letterSpacing: layout.title.spacing,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          textAlign: "right",
          fontSize: layout.fontSizeBase - 1,
          color: "#666",
          marginBottom: 12,
        }}
      >
        <div>No：EST-202604-001</div>
        <div>{ISSUED_LABEL[docType]}：2026/04/22</div>
      </div>

      {/* main */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>{leftIsRecipient ? recipientBlock : issuerBlock}</div>
        <div style={{ width: 200 }}>{leftIsRecipient ? issuerBlock : recipientBlock}</div>
      </div>

      {/* items table */}
      <div
        style={{
          display: "flex",
          borderBottom: `2px solid ${layout.colors.headerRule}`,
          paddingBottom: 4,
          fontSize: layout.fontSizeBase - 1,
          color: "#666",
          fontWeight: 700,
        }}
      >
        <div style={{ flex: 3 }}>摘要</div>
        <div style={{ width: 40, textAlign: "right" }}>数量</div>
        {layout.items.showUnit && <div style={{ width: 40, textAlign: "center" }}>単位</div>}
        <div style={{ width: 70, textAlign: "right" }}>単価</div>
        <div style={{ width: 80, textAlign: "right" }}>金額</div>
      </div>
      {[
        { desc: "サンプル商品A", qty: 1, unit: "個", price: 57750, amount: 57750 },
        { desc: "サンプル商品B", qty: 2, unit: "個", price: 17600, amount: 35200 },
        { desc: "施工費", qty: 1, unit: "式", price: 20000, amount: 20000 },
      ].map((row, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            padding: "5px 0",
            borderBottom: "1px solid #eee",
            fontSize: layout.fontSizeBase,
          }}
        >
          <div style={{ flex: 3 }}>
            {row.desc}
            {layout.items.showTaxLabel && i === 0 ? "" : ""}
          </div>
          <div style={{ width: 40, textAlign: "right" }}>{row.qty}</div>
          {layout.items.showUnit && <div style={{ width: 40, textAlign: "center" }}>{row.unit}</div>}
          <div style={{ width: 70, textAlign: "right" }}>¥{row.price.toLocaleString()}</div>
          <div style={{ width: 80, textAlign: "right" }}>¥{row.amount.toLocaleString()}</div>
        </div>
      ))}

      {/* totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <div style={{ width: 200 }}>
          <TotalsRow label="小計" value="¥112,950" />
          <TotalsRow label="消費税（10%）" value="¥11,295" />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "4px 0",
              fontSize: layout.fontSizeBase + 2,
              fontWeight: 700,
            }}
          >
            <span>合計</span>
            <span>¥124,245</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, fontSize }: { label: string; value: string; fontSize: number }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "3px 0",
        borderBottom: "1px solid #eee",
        fontSize,
      }}
    >
      <div style={{ width: 70, fontWeight: 700, color: "#444" }}>{label}</div>
      <div style={{ flex: 1, color: "#333" }}>{value}</div>
    </div>
  );
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "3px 0",
        borderBottom: "1px solid #eee",
        fontSize: 12,
      }}
    >
      <span style={{ color: "#666" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
