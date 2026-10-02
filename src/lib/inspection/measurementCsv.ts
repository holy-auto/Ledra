import {
  getMeasurementField,
  measurementFieldsForForm,
  type IndicatedInspectionForm,
  type MeasurementInput,
} from "@/lib/validations/indicated-inspection";

/**
 * 外部テスタ出力の汎用 CSV を測定値配列へ正規化するパーサ。 [G5 / Phase 2 取込UI]
 *
 * 行形式: `field_code,value,unit?`（BOM・先頭 `#` 行・ヘッダ行 `field_code,...` は無視）。
 * value は項目の値種別で解釈する:
 * - numeric … 数値（unit 省略時はカタログ既定）
 * - judgment … 良/否/該当なし（pass/fail/na も可）
 * - text … 文字列（最大200字）
 * サーバの measurementsPutSchema で弾かれる条件（未知コード・様式外・単位不正・数値不可・空値・
 * 文字数超過・重複）はプレビューと食い違わないよう本パーサでも同じ理由で除外する。
 *
 * ponytail: 区切りは素朴なカンマ split（引用符・エスケープ・千区切り非対応）。値にカンマを含む
 * テスタ出力（例 "8,600" や引用フィールド）は列がずれるため、取込元で正準化してから渡す前提。
 * 本格的な CSV パースが必要になれば papaparse 等の導入を検討（現状は field_code,value,unit の単純形）。
 */

export type CsvParseResult = {
  rows: MeasurementInput[];
  issues: { line: number; code: string; reason: string }[];
};

const JUDGMENT_MAP: Record<string, "pass" | "fail" | "na"> = {
  pass: "pass",
  fail: "fail",
  na: "na",
  良: "pass",
  否: "fail",
  該当なし: "na",
  "○": "pass",
  "×": "fail",
};

// 平易な十進数のみ許可（16進 0x..・指数 1e3・空白混じりを弾く）。サーバの finite 数値と整合。
const DECIMAL_RE = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;
const TEXT_MAX = 200;

function splitCsvLine(line: string): string[] {
  return line.split(",").map((c) => c.trim());
}

export function parseMeasurementCsv(text: string, form: IndicatedInspectionForm): CsvParseResult {
  const rows: MeasurementInput[] = [];
  const issues: CsvParseResult["issues"] = [];
  const seen = new Set<string>();
  const formCodes = new Set(measurementFieldsForForm(form).map((f) => f.code));

  // BOM 除去（CSV エクスポートに先頭 ﻿ が付くことがある）
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === "" || raw.startsWith("#")) continue;
    const cols = splitCsvLine(raw);
    const code = cols[0] ?? "";
    // ヘッダ行は位置に関わらずスキップ（先頭に空行/コメント/BOM があっても拾えるように）
    if (code.toLowerCase() === "field_code") continue;
    if (code === "") continue;

    const def = getMeasurementField(code);
    if (!def) {
      issues.push({ line: i + 1, code, reason: "未知の測定項目コード" });
      continue;
    }
    if (!formCodes.has(code)) {
      issues.push({ line: i + 1, code, reason: "この様式に無い項目" });
      continue;
    }
    if (seen.has(code)) {
      issues.push({ line: i + 1, code, reason: "重複行" });
      continue;
    }
    const value = (cols[1] ?? "").trim();
    const unit = (cols[2] ?? "").trim() || null;
    if (value === "") {
      issues.push({ line: i + 1, code, reason: "値が空" });
      continue;
    }
    // 単位はカタログの許容集合のみ（サーバ検証と一致。judgment 項目は単位を持たない）。
    if (unit && (!def.units || !def.units.includes(unit))) {
      issues.push({ line: i + 1, code, reason: `単位が不正（許容: ${def.units?.join("/") ?? "なし"}）` });
      continue;
    }

    if (def.valueKind === "numeric") {
      if (!DECIMAL_RE.test(value)) {
        issues.push({ line: i + 1, code, reason: "数値に変換できない" });
        continue;
      }
      rows.push({
        field_code: code,
        num_value: Number(value),
        unit: unit ?? def.units?.[0] ?? null,
        source: "imported",
      });
    } else if (def.valueKind === "judgment") {
      const j = JUDGMENT_MAP[value];
      if (!j) {
        issues.push({ line: i + 1, code, reason: "判定は 良/否/該当なし（pass/fail/na）" });
        continue;
      }
      rows.push({ field_code: code, judgment: j, source: "imported" });
    } else {
      if (value.length > TEXT_MAX) {
        issues.push({ line: i + 1, code, reason: `文字数超過（最大${TEXT_MAX}字）` });
        continue;
      }
      rows.push({ field_code: code, text_value: value, unit: unit ?? def.units?.[0] ?? null, source: "imported" });
    }
    seen.add(code);
  }
  return { rows, issues };
}
