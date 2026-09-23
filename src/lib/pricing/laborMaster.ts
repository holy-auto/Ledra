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

/**
 * (型式, キー) の完全一致 → 無ければ型式共通 '*' の順で引く。
 * キーは part_key（品番・作業名）に加えて名称（label）とも照合する
 * （d-Happy の貼り付け登録は品番が part_key、品名は label に入るため）。part_key の一致を優先。
 */
export function findEntry(entries: LaborEntry[], modelCode: string, key: string): LaborEntry | null {
  const model = normalizeModelCode(modelCode);
  const k = normalizeKey(key);
  if (!k) return null;
  for (const m of [model, ANY_MODEL]) {
    const inModel = entries.filter((e) => e.model_code === m);
    const hit = inModel.find((e) => e.part_key === k) ?? inModel.find((e) => normalizeKey(e.label) === k);
    if (hit) return hit;
  }
  return null;
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
    // DB の CHECK（labor_hour_masters）と同じ上限。1行の超過で一括保存全体が落ちないよう行単位で弾く
    if (
      model.length > 20 ||
      (cells[1] ?? "").length > 100 ||
      (cells[4] ?? "").length > 200 ||
      (cells[5] ?? "").length > 1000
    )
      return void errors.push(`${no}: 文字数が上限を超えています（型式20・品番100・名称200・URL1000）`);
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

/** d-Happy（Honda Access 用品適用検索）の出典 URL。 */
export const DHAPPY_SOURCE_URL = "https://sfh.honda.co.jp/T001";

/**
 * d-Happy「装着用品確認」の表を人がドラッグ選択でコピーした文字列を、工数 CSV に変換する。
 * コピーの形（1品目ごと）:
 *   品名
 *   品番<TAB>価格<TAB>取付工数<TAB>
 *   合計金額
 * 品番・工数の行を見つけ、その直前の空でない行を品名とする。サイトへは自動アクセスしない
 * （robots.txt が全面 Disallow のため、人の操作で得た表だけを取り込む）。
 */
export function dHappyPasteToCsv(text: string, modelCode: string): { csv: string; count: number; errors: string[] } {
  const model = normalizeModelCode(modelCode);
  if (!model || model === ANY_MODEL) return { csv: "", count: 0, errors: ["型式を入力してください（例: GP3）"] };
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out: string[] = [];
  const errors: string[] = [];
  lines.forEach((line, i) => {
    const m = line.normalize("NFKC").match(/^([0-9A-Z]{6,20})\s+[\d,]+\s+(\S+)$/i);
    if (!m) return;
    const hours = Number(m[2]);
    if (!Number.isFinite(hours) || hours < 0) return void errors.push(`${i + 1}行目: 取付工数を読めません（${m[2]}）`);
    let j = i - 1;
    while (j >= 0 && !lines[j]) j--;
    // 品名はCSVの区切りと衝突しないよう半角カンマを読点に置き換える
    const label = j >= 0 && !/^項目/.test(lines[j]) ? lines[j].replace(/,/g, "、") : "";
    out.push([model, m[1].toUpperCase(), hours, "", label, DHAPPY_SOURCE_URL].join(","));
  });
  if (out.length === 0 && errors.length === 0) errors.push("品番と取付工数の行が見つかりませんでした");
  return { csv: out.join("\n"), count: out.length, errors };
}

export interface ExistingLaborRow {
  model_code: string;
  part_key: string;
  hours: number | string | null;
  fixed_price: number | null;
  part_number?: string | null;
  label?: string | null;
  source_url?: string | null;
}

export interface LaborConflict {
  model_code: string;
  part_number: string;
  label: string | null;
  current: { hours: number | null; fixed_price: number | null };
  incoming: { hours: number | null; fixed_price: number | null };
}

/**
 * 登録しようとする行を、既存マスタと (型式, 品番キー) で突き合わせて振り分ける。
 * - 未登録 → toInsert
 * - 工数・定額が同じ → unchanged（書かない）。ただし品名・出典・品番表記だけが変わった行は
 *   金額に影響しないので metaUpdates として更新する（今回が空欄の項目は既存を消さない）
 * - 値が違う → conflicts（あとから入ってきた値で上書きする。何が変わったかを画面に出すために分ける）
 */
export function classifyAgainstExisting(rows: LaborCsvRow[], existing: ExistingLaborRow[]) {
  const num = (v: number | string | null) => (v == null ? null : Number(v));
  const byKey = new Map(existing.map((e) => [`${e.model_code}\u0000${e.part_key}`, e]));
  const toInsert: LaborCsvRow[] = [];
  const unchanged: LaborCsvRow[] = [];
  const metaUpdates: LaborCsvRow[] = [];
  const conflicts: { row: LaborCsvRow; conflict: LaborConflict }[] = [];
  for (const r of rows) {
    const cur = byKey.get(`${r.model_code}\u0000${r.part_key}`);
    if (!cur) toInsert.push(r);
    else if (num(cur.hours) === r.hours && cur.fixed_price === r.fixed_price) {
      const changed = (["part_number", "label", "source_url"] as const).some(
        (f) => cur[f] !== undefined && r[f] != null && r[f] !== cur[f], // undefined = 照会していない項目
      );
      if (!changed) unchanged.push(r);
      else
        metaUpdates.push({
          ...r,
          label: r.label ?? cur.label ?? null,
          source_url: r.source_url ?? cur.source_url ?? null,
        });
    } else
      conflicts.push({
        row: r,
        conflict: {
          model_code: r.model_code,
          part_number: r.part_number,
          label: r.label,
          current: { hours: num(cur.hours), fixed_price: cur.fixed_price },
          incoming: { hours: r.hours, fixed_price: r.fixed_price },
        },
      });
  }
  return { toInsert, unchanged, metaUpdates, conflicts };
}

export interface LaborImportResult {
  inserted?: number;
  updated?: number;
  unchanged?: number;
  /** 登録済みと値が違い、今回の値で上書きした行 */
  overwritten?: LaborConflict[];
  errors?: string[];
}

const fmtValue = (v: { hours: number | null; fixed_price: number | null }) =>
  v.fixed_price != null ? `定額${v.fixed_price.toLocaleString()}円` : `${v.hours ?? "-"}h`;

/** 登録結果を画面表示用の1文にする（管理画面・帳票フォーム共用）。 */
export function formatImportSummary(r: LaborImportResult): string {
  const parts = [`新規 ${r.inserted ?? 0} 件`];
  if (r.updated) parts.push(`上書き ${r.updated} 件`);
  if (r.unchanged) parts.push(`登録済み（同じ値）${r.unchanged} 件`);
  if (r.errors?.length) parts.push(`登録しなかった行 ${r.errors.length} 件: ${r.errors.join(" / ")}`);
  return parts.join("、");
}

/** 上書き1件の説明（例: GP3 08P18SYY011 登録済み 0.2h → 今回 0.1h）。 */
export function describeConflict(c: LaborConflict): string {
  const model = c.model_code === ANY_MODEL ? "型式共通" : c.model_code;
  return `${model} ${c.part_number}${c.label ? `（${c.label}）` : ""} 登録済み ${fmtValue(c.current)} → 今回 ${fmtValue(c.incoming)}`;
}

export interface ModelCoverage {
  model_code: string;
  /** その型式の車台番号の例（収集時に d-Happy へ入れる1台）。 */
  sample_chassis: string;
  /** 手元にある同じ型式の車台番号の数。 */
  vehicle_count: number;
  /** 工数マスタに登録済みの行数（0 = 未収集）。 */
  registered_rows: number;
}

/**
 * 車台番号の一覧を型式ごとにまとめ、工数マスタの登録状況と突き合わせる。
 * 未収集（登録0行）を先頭に、台数の多い順。型式を取り出せない番号は unparsed に分ける
 * （番号だけの F-NO から型式を推測しない）。
 */
export function summarizeCoverage(chassisList: string[], registeredRowsByModel: Record<string, number>) {
  const byModel = new Map<string, ModelCoverage>();
  const unparsed: string[] = [];
  const seen = new Set<string>(); // 同じ車台番号を登録車両と貼り付けの両方から数えない
  for (const raw of chassisList) {
    const chassis = raw.normalize("NFKC").trim().toUpperCase().replace(/\s/g, "");
    if (!chassis || seen.has(chassis)) continue;
    seen.add(chassis);
    const model = modelCodeFromChassis(chassis);
    if (!model) {
      unparsed.push(raw.trim());
      continue;
    }
    const cur = byModel.get(model);
    if (cur) cur.vehicle_count++;
    else
      byModel.set(model, {
        model_code: model,
        sample_chassis: chassis,
        vehicle_count: 1,
        registered_rows: registeredRowsByModel[model] ?? 0,
      });
  }
  const rows = [...byModel.values()].sort(
    (a, b) =>
      Number(a.registered_rows > 0) - Number(b.registered_rows > 0) ||
      b.vehicle_count - a.vehicle_count ||
      a.model_code.localeCompare(b.model_code),
  );
  return { rows, unparsed: [...new Set(unparsed)] };
}

/** 貼り付けた車台番号の文字列を1台ずつに分ける。「GP3 - 1017220」のようなハイフン前後の空白は詰める。 */
export function splitChassisInput(text: string): string[] {
  return text
    .normalize("NFKC")
    .replace(/\s*-\s*/g, "-")
    .split(/[\s,、]+/)
    .filter(Boolean);
}

/** 品番（key）で引き、無ければ品名（alt）で引く。どちらで当たったかも返す。 */
export function findEntryWithFallback(
  entries: LaborEntry[],
  modelCode: string,
  key: string,
  alt: string | null | undefined,
): { entry: LaborEntry | null; by: "key" | "alt_key" | null } {
  const byKey = findEntry(entries, modelCode, key);
  if (byKey) return { entry: byKey, by: "key" };
  const byAlt = alt ? findEntry(entries, modelCode, alt) : null;
  return { entry: byAlt, by: byAlt ? "alt_key" : null };
}

/** CSV 1セルに入れる。区切りの半角カンマは全角「，」へ（NFKC で照合キーは元と一致する）。 */
const csvCell = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/,/g, "，")
    .replace(/[\r\n]+/g, " ")
    .trim();

/**
 * 添付ファイル（Excel / CSV を行に分けたもの）を工数 CSV に変換する。対応する形は2つ:
 * - 工数マスタ形式: 1行目が「型式,品番,…」 → そのまま
 * - d-Happy 収集形式: 見出しに「項目」「取付工数」「車台番号」（任意で「備考」）
 *   型式は車台番号から取り、同じ型式・品名で工数が食い違うときは後の行（あとから入ってきた値）を採り、
 *   overwritten に出す。工数が空欄の行は errors。
 */
export function sheetRowsToLaborCsv(rows: string[][]): {
  csv: string;
  count: number;
  errors: string[];
  overwritten: string[];
} {
  const header = (rows[0] ?? []).map((h) => (h ?? "").normalize("NFKC").trim());
  const col = (name: string) => header.findIndex((h) => h === name);

  if (/^型式/.test(header[0] ?? "")) {
    // 見出しと空行も残して渡す（parseLaborCsv の「N行目」が元のファイルの行と一致するように）
    const count = rows.slice(1).filter((r) => r.some((c) => (c ?? "").trim())).length;
    return { csv: rows.map((r) => r.map(csvCell).join(",")).join("\n"), count, errors: [], overwritten: [] };
  }

  const [iItem, iHours, iVin, iNote] = [col("項目"), col("取付工数"), col("車台番号"), col("備考")];
  if (iItem < 0 || iHours < 0 || iVin < 0) {
    return {
      csv: "",
      count: 0,
      errors: ["列が読み取れません。「型式,品番,工数h,…」か「項目・取付工数・車台番号」の見出しが必要です"],
      overwritten: [],
    };
  }

  const errors: string[] = [];
  const groups = new Map<string, { model: string; item: string; hours: number[]; note: string }>();
  rows.slice(1).forEach((r, i) => {
    const item = (r[iItem] ?? "").trim();
    if (!item) return;
    const no = `${i + 2}行目`;
    const model = modelCodeFromChassis(r[iVin]);
    if (!model) return void errors.push(`${no}: 車台番号から型式が分かりません（${r[iVin] ?? ""}）`);
    const rawHours = (r[iHours] ?? "").trim();
    if (!rawHours) return void errors.push(`${no}: 取付工数が空欄のため登録しません（${item}）`);
    const hours = Math.round(Number(rawHours) * 100) / 100;
    if (!Number.isFinite(hours) || hours < 0) return void errors.push(`${no}: 取付工数を読めません（${rawHours}）`);
    const key = `${model}\u0000${normalizeKey(item)}`;
    const g = groups.get(key) ?? { model, item, hours: [], note: "" };
    g.hours.push(hours);
    const note = iNote >= 0 ? (r[iNote] ?? "").trim() : "";
    if (note) g.note = note; // 備考も後の行を採る
    groups.set(key, g);
  });

  const lines: string[] = [];
  const overwritten: string[] = [];
  for (const g of groups.values()) {
    const last = g.hours[g.hours.length - 1];
    if (g.hours.some((h) => h !== last))
      overwritten.push(`${g.model} ${g.item}: ${g.hours.map((h) => `${h}h`).join(" → ")}（後の行の ${last}h を採用）`);
    const label = (csvCell(g.item) + (g.note ? `（${csvCell(g.note)}）` : "")).slice(0, 200);
    lines.push([g.model, csvCell(g.item), last, "", label, DHAPPY_SOURCE_URL].join(","));
  }
  return { csv: lines.join("\n"), count: lines.length, errors, overwritten };
}
