import { buildTaxBreakdown, totalTax } from "@/lib/invoice/taxBreakdown";

/** 帳票明細から items_json・小計・消費税・合計・税率区分内訳を算出する。 */
export function calcItems(items: any[], taxRate: number, isTaxInclusive = false) {
  let itemsSum = 0; // 通常行 amount の合計（税込モードでは税込合計、税抜モードでは税抜合計）
  let runningSubtotal = 0; // 直前の小計行からの累積（小計行の金額自動算出に使用）
  const itemsJson = items.map((item: any) => {
    const itemType = item.item_type === "heading" || item.item_type === "subtotal" ? item.item_type : "item";

    if (itemType === "heading") {
      return {
        item_type: "heading",
        description: (item.description ?? "").trim(),
        quantity: 0,
        unit: (item.unit ?? "").trim() || null,
        unit_price: 0,
        amount: 0,
      } as Record<string, unknown>;
    }

    if (itemType === "subtotal") {
      const subtotalAmount = runningSubtotal;
      runningSubtotal = 0;
      return {
        item_type: "subtotal",
        description: (item.description ?? "").trim() || "小計",
        quantity: 0,
        unit: null,
        unit_price: 0,
        amount: subtotalAmount,
      } as Record<string, unknown>;
    }

    const qty = parseFloat(String(item.quantity || 0)) || 0;
    const unitPrice = parseInt(String(item.unit_price || 0), 10);
    const amount = Math.round(qty * unitPrice);
    itemsSum += amount;
    runningSubtotal += amount;
    const mapped: Record<string, unknown> = {
      item_type: "item",
      description: (item.description ?? "").trim(),
      quantity: qty,
      unit: (item.unit ?? "").trim() || null,
      unit_price: unitPrice,
      amount,
    };
    if (item.item_code != null && String(item.item_code).trim()) mapped.item_code = String(item.item_code).trim();
    if (item.tax_category != null) {
      mapped.tax_category = item.tax_category;
      // レガシーな /api/admin/invoices・pdfInvoice.tsx は tax_rate/is_reduced_rate を見るため、
      // 同じ明細を両ルートのどちらで読んでも軽減税率表示が揃うよう併記しておく。
      mapped.tax_rate = item.tax_category;
      if (item.tax_category === 8) mapped.is_reduced_rate = true;
    }
    if (item.cost_price != null && item.cost_price !== "") {
      const cp = parseInt(String(item.cost_price), 10);
      if (!isNaN(cp) && cp >= 0) mapped.cost_price = cp;
    }
    if (item.margin_rate != null && item.margin_rate !== "") {
      const mr = parseFloat(String(item.margin_rate));
      if (!isNaN(mr)) mapped.margin_rate = mr;
    }
    if (item.certificate_id) mapped.certificate_id = item.certificate_id;
    if (item.certificate_public_id) mapped.certificate_public_id = item.certificate_public_id;
    return mapped;
  });

  let subtotal: number;
  let tax: number;
  let total: number;
  let taxBreakdown: { rate: number; subtotal: number; tax: number }[];
  if (isTaxInclusive) {
    // 税込入力モード：amount は税込金額。税抜の subtotal を逆算する。
    // (複数税率の混在は非対応。税込モードは単一税率の書類のみを想定)
    total = itemsSum;
    subtotal = Math.round(itemsSum / (1 + taxRate / 100));
    tax = total - subtotal;
    taxBreakdown = [{ rate: taxRate, subtotal, tax }];
  } else {
    // 税抜入力モード（既定）。行ごとの tax_category (10/8) を見て税率区分ごとに
    // 「対価の額」「消費税額等」を分けて集計する（適格請求書の複数税率区分表示要件）。
    taxBreakdown = buildTaxBreakdown(
      itemsJson
        .filter((it) => it.item_type === "item")
        .map((it) => ({
          amount: it.amount as number,
          tax_rate: typeof it.tax_category === "number" ? (it.tax_category as number) : null,
        })),
      taxRate,
    );
    subtotal = itemsSum;
    tax = totalTax(taxBreakdown);
    total = subtotal + tax;
  }
  return { itemsJson, subtotal, tax, total, taxBreakdown };
}
