/**
 * vehicle_size_master への CSV 一括インポート用の純粋なパーサ。
 *
 * 運営 (platform admin) が、正規ライセンスの諸元データや自前の車種リストを
 * まとめて投入するために使う。size_class は手入力させず、寸法から
 * `calcSizeClass` (体積しきい値) で自動決定する — DB の calc_size_class_from_volume /
 * マイグレーションと同一基準。寸法が無い行はサイズ区分を明示した場合のみ受け付ける。
 *
 * CSV 列 (ヘッダ任意): maker, model, full_length_mm, full_width_mm, full_height_mm,
 *                      body_type(任意), size_class(任意/寸法が無いとき用)
 *
 * IO を持たない純関数。単体テストで担保する。
 */
import { calcSizeClass } from "@/lib/ocr/shakensho";

export interface VehicleMasterImportRow {
  maker: string;
  model: string;
  size_class: string;
  body_type: string | null;
  full_length_mm: number | null;
  full_width_mm: number | null;
  full_height_mm: number | null;
}

export interface ParseVehicleMasterResult {
  rows: VehicleMasterImportRow[];
  /** 行番号付きのスキップ理由 (UI 表示用)。 */
  errors: string[];
}

const SIZE_CLASSES = new Set(["SS", "S", "M", "L", "LL", "XL"]);

/** 1 セルの前後空白と囲みダブルクォートを外す。 */
function splitCsvLine(line: string): string[] {
  return line.split(",").map((s) => s.trim().replace(/^"(.*)"$/, "$1"));
}

/** 正の整数として解釈できれば返す。それ以外 (空・0・非数値) は null。 */
function toPositiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseVehicleMasterCsv(csv: string): ParseVehicleMasterResult {
  const rows: VehicleMasterImportRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>(); // ファイル内の (maker, model) 重複排除

  const lines = csv
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  lines.forEach((line, idx) => {
    const parts = splitCsvLine(line);
    // 1 行目がヘッダ (maker / メーカー) ならスキップ。
    if (idx === 0 && (parts[0]?.toLowerCase() === "maker" || parts[0] === "メーカー")) return;

    const maker = parts[0] ?? "";
    const model = parts[1] ?? "";
    if (!maker || !model) {
      errors.push(`${idx + 1}行目: メーカーと車種は必須です`);
      return;
    }

    const len = toPositiveInt(parts[2]);
    const wid = toPositiveInt(parts[3]);
    const hei = toPositiveInt(parts[4]);
    const bodyType = parts[5] || null;
    const explicitSize = (parts[6] ?? "").toUpperCase();

    let sizeClass: string | null = null;
    if (len && wid && hei) sizeClass = calcSizeClass(len, wid, hei);
    else if (SIZE_CLASSES.has(explicitSize)) sizeClass = explicitSize;

    if (!sizeClass) {
      errors.push(
        `${idx + 1}行目 (${maker} ${model}): 寸法3つ (全長/全幅/全高) か サイズ区分(SS〜XL) のいずれかが必要です`,
      );
      return;
    }

    const key = `${maker}|${model}`;
    if (seen.has(key)) {
      errors.push(`${idx + 1}行目 (${maker} ${model}): CSV内で重複しています`);
      return;
    }
    seen.add(key);

    rows.push({
      maker,
      model,
      size_class: sizeClass,
      body_type: bodyType,
      full_length_mm: len,
      full_width_mm: wid,
      full_height_mm: hei,
    });
  });

  return { rows, errors };
}
