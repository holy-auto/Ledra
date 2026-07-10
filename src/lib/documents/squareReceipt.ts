/** Square オーダーの明細・金額情報から領収書 (documents) の下書きデータを組み立てるヘルパ。 */

export type SquareLineItemLike = {
  name?: string;
  quantity?: string | number;
  total_money?: { amount?: number };
  base_price_money?: { amount?: number };
};

/**
 * Square の税込金額 (total_amount) と税額 (tax_amount) から実効税率を逆算する。
 * tax_amount=0 は非課税として扱い、総額が0以下などの異常値のときのみ
 * 標準税率10%にフォールバックする。
 */
export function deriveTaxRateFromSquareAmounts(totalAmount: number, taxAmount: number): number {
  if (taxAmount === 0) return 0;
  const preTax = totalAmount - taxAmount;
  if (preTax <= 0) return 10;
  return Math.round((taxAmount / preTax) * 100);
}

/**
 * Square の line_items を documents.items_json 用の入力形式にマッピングする。
 * quantity=1・unit_price=明細合計金額として渡すことで、Square の total_money を
 * そのまま転記する（数量で割って単価を逆算すると端数丸めで合計が数円ずれ得るため）。
 */
export function mapSquareLineItems(rawItems: SquareLineItemLike[], taxCategory: number) {
  return rawItems.map((li) => {
    const qty = parseFloat(String(li.quantity ?? "1")) || 1;
    const totalMoney = Number(li.total_money?.amount ?? li.base_price_money?.amount ?? 0);
    const name = li.name || "商品";
    return {
      description: qty !== 1 ? `${name}（数量: ${qty}）` : name,
      quantity: 1,
      unit_price: totalMoney,
      tax_category: taxCategory,
    };
  });
}
