import {
  getMeasurementField,
  measurementFieldsForForm,
  type IndicatedInspectionForm,
  type MeasurementInput,
} from "@/lib/validations/indicated-inspection";

/**
 * 外部テスタ出力の汎用 CSV を測定値配列へ正規化するパーサ。 [G5 / Phase 2 取込UI]
 *
 * 行形式: `field_code,value,unit?`（先頭の `#` 行とヘッダ行 `field_code,...` は無視）。
 * value は項目の値種別で解釈する:
 * - numeric … 数値（unit 省略時はカタログ既定）
 * - judgment … 良/否/該当なし（pass/fail/na も可）
 * - text … 文字列
 * 未知コード・様式外コード・数値変換不可は issues に理由付きで返し、rows には含めない。
 * 実際の値整合・単位整合はサーバの measurementsPutSchema が最終検証する（本パーサは前処理）。
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

function splitCsvLine(line: string): string[] {
  return line.split(",").map((c) => c.trim());
}

export function parseMeasurementCsv(text: string, form: IndicatedInspectionForm): CsvParseResult {
  const rows: MeasurementInput[] = [];
  const issues: CsvParseResult["issues"] = [];
  const seen = new Set<string>();
  const formCodes = new Set(measurementFieldsForForm(form).map((f) => f.code));

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === "" || raw.startsWith("#")) continue;
    const cols = splitCsvLine(raw);
    const code = cols[0] ?? "";
    // ヘッダ行はスキップ
    if (i === 0 && code.toLowerCase() === "field_code") continue;
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

    if (def.valueKind === "numeric") {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        issues.push({ line: i + 1, code, reason: "数値に変換できない" });
        continue;
      }
      rows.push({ field_code: code, num_value: n, unit: unit ?? def.units?.[0] ?? null, source: "imported" });
    } else if (def.valueKind === "judgment") {
      const j = JUDGMENT_MAP[value];
      if (!j) {
        issues.push({ line: i + 1, code, reason: "判定は 良/否/該当なし（pass/fail/na）" });
        continue;
      }
      rows.push({ field_code: code, judgment: j, source: "imported" });
    } else {
      rows.push({ field_code: code, text_value: value, unit: unit ?? def.units?.[0] ?? null, source: "imported" });
    }
    seen.add(code);
  }
  return { rows, issues };
}
