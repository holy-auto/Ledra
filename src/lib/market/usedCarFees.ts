/**
 * 中古車販売の「諸費用・支払総額の見積」明細を組み立てる純ロジック。
 *
 * 監査 (docs/clerical-gap-audit-used-car-sales-2026-06.md 断絶1) で指摘された
 * 「諸費用明細と総額計算が一切無い」状態を解消するための第一歩。車両本体価格 +
 * 標準的な諸費用のプリセット明細を生成し、documents API (doc_type='estimate') に
 * 渡せる item[] を返す。金額は既定 0 の編集可能なスケルトンで、担当者が確定後に
 * ドキュメントエディタで各行を埋める運用を想定する (AI 化は後続でアダプタを足す)。
 *
 * 税区分について:
 *   documents の税計算 (calcItems) は行単位の税区分をサポートせず、伝票全体を単一
 *   tax_rate で課税する (行の tax_category は PDF 側でも 8% 軽減以外は解釈されない)。
 *   中古車の諸費用は課税 (代行手数料・整備費 等) と非課税 (法定費用・預託金・保険料) が
 *   混在するため、行単位の税区分は現行システムでは正しく表現できない。
 *
 *   そこで見積は「各行 = 税込 (内税) の支払額」「伝票 tax_rate = 0」で作成する。
 *   - 支払総額 = 行金額の単純合計となり、混在課税でも総額が正確。
 *   - 消費税は各金額に内税で含む前提 (別建てで 10% を上乗せしない)。
 *   - documents→請求書変換は元伝票の tax_rate を引き継ぐため、tax_rate=0 なら変換後も
 *     二重課税されない (税込入力フラグは変換で保持されないため、その依存を避ける)。
 *   行単位課税の正式対応は documents 側の機能拡張後に見直す。
 */

/** 諸費用プリセットの識別子 (UI からの金額差し込み用キー)。 */
export type UsedCarFeeKey =
  // 課税諸費用
  | "dealer_fee" // 販売店手数料
  | "prep_maintenance" // 納車整備費用
  | "delivery_fee" // 納車費用
  | "registration_agent" // 登録手続代行費用
  | "garage_cert_agent" // 車庫証明代行費用
  // 非課税諸費用 (法定費用・預託金・保険料)
  | "auto_tax" // 自動車税 (種別割・月割)
  | "env_performance_tax" // 環境性能割
  | "weight_tax" // 自動車重量税
  | "compulsory_insurance" // 自賠責保険料
  | "recycling_deposit" // リサイクル預託金
  | "statutory_registration" // 検査登録・車庫証明 法定費用
  | "stamp_duty"; // 印紙代

interface FeePreset {
  key: UsedCarFeeKey;
  label: string;
}

/** 課税諸費用 (販売店の役務提供 = 消費税課税対象。金額は税込で入力)。 */
const TAXABLE_FEES: readonly FeePreset[] = [
  { key: "dealer_fee", label: "販売店手数料" },
  { key: "prep_maintenance", label: "納車整備費用" },
  { key: "delivery_fee", label: "納車費用" },
  { key: "registration_agent", label: "登録手続代行費用" },
  { key: "garage_cert_agent", label: "車庫証明代行費用" },
] as const;

/** 非課税諸費用 (法定費用・預託金・保険料 = 消費税不課税)。 */
const EXEMPT_FEES: readonly FeePreset[] = [
  { key: "auto_tax", label: "自動車税（種別割・月割）" },
  { key: "env_performance_tax", label: "環境性能割" },
  { key: "weight_tax", label: "自動車重量税" },
  { key: "compulsory_insurance", label: "自賠責保険料" },
  { key: "recycling_deposit", label: "リサイクル預託金" },
  { key: "statutory_registration", label: "検査登録・車庫証明 法定費用" },
  { key: "stamp_duty", label: "印紙代" },
] as const;

/**
 * documents API (calcItems) が解釈する明細行の形。
 * 行単位の税区分は現行 documents では正しく計算されないため付与しない
 * (各金額は税込・伝票 tax_rate=0 で扱う)。
 */
export interface EstimateItem {
  item_type: "item" | "heading";
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
}

export interface UsedCarEstimateInput {
  /** 車両ラベル (例: "トヨタ プリウス")。空なら "車両" を用いる。 */
  vehicleLabel?: string | null;
  /** 車両本体価格 (合意価格)。null は 0 扱い。 */
  agreedPrice?: number | null;
  /** 諸費用の金額差し込み (キー未指定は 0)。 */
  fees?: Partial<Record<UsedCarFeeKey, number>>;
  /** 下取り充当額 (税込)。0/未指定なら下取り行を出さない。支払総額から差し引く。 */
  tradeInAllowance?: number | null;
  /** 下取り車ラベル (例: "日産 デイズ")。下取り行の説明に付す。 */
  tradeInLabel?: string | null;
}

function sanitizeAmount(v: number | null | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return 0;
  return Math.round(v);
}

/**
 * 見積の明細 (見出し + 明細行) を生成する。税込入力モード前提で、各行の unit_price は
 * その行の支払額 (税込) を表す。支払総額 = 全明細行金額の合計 (= estimateTotal)。
 */
export function buildUsedCarEstimateItems(input: UsedCarEstimateInput): EstimateItem[] {
  const label = (input.vehicleLabel ?? "").trim() || "車両";
  const fees = input.fees ?? {};
  const items: EstimateItem[] = [];

  // 車両本体
  items.push({ item_type: "heading", description: "車両本体", quantity: 0, unit: null, unit_price: 0 });
  items.push({
    item_type: "item",
    description: `車両本体価格（${label}）`,
    quantity: 1,
    unit: "台",
    unit_price: sanitizeAmount(input.agreedPrice),
  });

  // 課税諸費用 (税込)
  items.push({ item_type: "heading", description: "課税諸費用（税込）", quantity: 0, unit: null, unit_price: 0 });
  for (const f of TAXABLE_FEES) {
    items.push({
      item_type: "item",
      description: f.label,
      quantity: 1,
      unit: "式",
      unit_price: sanitizeAmount(fees[f.key]),
    });
  }

  // 非課税諸費用 (法定費用・預託金・保険料)
  items.push({
    item_type: "heading",
    description: "非課税諸費用（法定費用・預託金・保険料）",
    quantity: 0,
    unit: null,
    unit_price: 0,
  });
  for (const f of EXEMPT_FEES) {
    items.push({
      item_type: "item",
      description: f.label,
      quantity: 1,
      unit: "式",
      unit_price: sanitizeAmount(fees[f.key]),
    });
  }

  // 下取り充当 (支払総額から差し引くマイナス行)。
  const tradeIn = sanitizeAmount(input.tradeInAllowance);
  if (tradeIn > 0) {
    const tradeInLabel = (input.tradeInLabel ?? "").trim();
    items.push({ item_type: "heading", description: "下取り", quantity: 0, unit: null, unit_price: 0 });
    items.push({
      item_type: "item",
      description: tradeInLabel ? `下取り充当（${tradeInLabel}）` : "下取り充当",
      quantity: 1,
      unit: "台",
      unit_price: -tradeIn,
    });
  }

  return items;
}

/** 明細行 (見出しを除く) の金額合計 = 支払総額 (税込)。 */
export function estimateTotal(items: EstimateItem[]): number {
  return items.filter((i) => i.item_type === "item").reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
}
