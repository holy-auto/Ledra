/**
 * 型式 × 品番 の工数マスタから、取付工賃をプログラムで算出する（AI を使わない）。
 *
 *   工賃 = 工数(h) × 店舗の時間単価(円/h)   … calcLaborPrice と同じ式
 *   または マスタに登録した定額（ETCセットアップ等、工数に乗らない作業）
 *
 * - 同じ品番でも型式で工数が変わるため、キーは (型式, 品番)。型式を問わない作業は
 *   型式 ANY_MODEL ('*') で登録し、完全一致が無いときだけ使う。
 * - 品番の無い作業（「ナビ移植」等）は名称をキーにする（normalizeKey で表記ゆれを吸収）。
 * - マスタに無いものは推測しない（null = 未登録）。
 *
 * IO を持たない純関数。単体テストで担保する。
 */
import { calcLaborPrice } from "@/lib/pricing/labor";

export const ANY_MODEL = "*";

/** 品番・作業名の照合キー。全角/半角・大小文字・空白・ハイフンの違いを吸収する。 */
export function normalizeKey(raw: string | null | undefined): string {
  return (raw ?? "").normalize("NFKC").toUpperCase().replace(/[\s-]/g, "");
}

/** 型式の照合キー。'*' はそのまま。 */
export function normalizeModelCode(raw: string | null | undefined): string {
  const s = (raw ?? "").normalize("NFKC").trim().toUpperCase();
  return s === ANY_MODEL ? s : s.replace(/[\s-]/g, "");
}

/**
 * 車台番号（F-NO）から型式を取り出す。"GP3-1017220" → "GP3"。
 * 番号だけ（"1204166"）など型式が含まれないときは null（車種名から推測しない）。
 */
export function modelCodeFromChassis(chassis: string | null | undefined): string | null {
  const m = (chassis ?? "")
    .normalize("NFKC")
    .trim()
    .match(/^([A-Z0-9]{2,6})\s*-\s*\d{5,}$/i);
  return m ? m[1].toUpperCase() : null;
}

export interface LaborEntry {
  model_code: string;
  part_key: string;
  hours: number | null;
  fixed_price: number | null;
  label: string | null;
}

/** (型式, キー) の完全一致 → 無ければ型式共通 '*' の順で引く。 */
export function findEntry(entries: LaborEntry[], modelCode: string, key: string): LaborEntry | null {
  const model = normalizeModelCode(modelCode);
  const k = normalizeKey(key);
  if (!k) return null;
  return (
    entries.find((e) => e.model_code === model && e.part_key === k) ??
    entries.find((e) => e.model_code === ANY_MODEL && e.part_key === k) ??
    null
  );
}

/** 店舗（支店）の時間単価を優先し、未設定なら自社の既定単価。 */
export function resolveRate(branchRate: number | null | undefined, tenantRate: number | null | undefined) {
  if (branchRate != null && branchRate > 0) return branchRate;
  if (tenantRate != null && tenantRate > 0) return tenantRate;
  return null;
}

/**
 * マスタ行と時間単価から税抜工賃を出す。定額が優先。
 * 工数 0h（本体取付に含まれるアタッチメント等）は 0 円。単価未設定で工数行なら null。
 */
export function laborPrice(entry: LaborEntry, rate: number | null): number | null {
  if (entry.fixed_price != null) return entry.fixed_price;
  if (entry.hours === 0) return 0;
  return calcLaborPrice(entry.hours, rate);
}

export interface LaborCsvRow {
  model_code: string;
  part_key: string;
  part_number: string;
  hours: number | null;
  fixed_price: number | null;
  label: string | null;
  source_url: string | null;
}

function toNonNegative(raw: string | undefined): number | null | "invalid" {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

/**
 * CSV: 型式, 品番(または作業名), 工数h, 定額円, 名称, 出典URL（ヘッダ行は任意）。
 * 工数と定額のどちらかは必須。型式を問わない作業は型式に '*'。
 * ponytail: 全カンマで単純分割（vehicleMasterImport と同じ流儀）。天井: クォート内カンマ不可。
 */
export function parseLaborCsv(text: string): { rows: LaborCsvRow[]; errors: string[] } {
  // 同じ (型式, 品番) が複数行あれば後の行を採用（一括 upsert で同一行を二度更新できないため）
  const rows = new Map<string, LaborCsvRow>();
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.split(",").map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    if (i === 0 && /型式|model/i.test(cells[0] ?? "")) return;
    const no = `${i + 1}行目`;
    const model = normalizeModelCode(cells[0]);
    const key = normalizeKey(cells[1]);
    if (!model || !key) return void errors.push(`${no}: 型式と品番（作業名）は必須です`);
    const hours = toNonNegative(cells[2]);
    const fixed = toNonNegative(cells[3]);
    if (hours === "invalid" || fixed === "invalid") return void errors.push(`${no}: 工数・定額は0以上の数値で`);
    if (hours == null && fixed == null) return void errors.push(`${no}: 工数か定額のどちらかが必要です`);
    rows.set(`${model}\u0000${key}`, {
      model_code: model,
      part_key: key,
      part_number: cells[1],
      hours: hours == null ? null : Math.round(hours * 100) / 100,
      fixed_price: fixed == null ? null : Math.round(fixed),
      label: cells[4] || null,
      source_url: cells[5] || null,
    });
  });
  return { rows: [...rows.values()], errors };
}
