import { z } from "zod";

/**
 * 指定整備記録簿（完成検査）の「検査機器等による検査」測定値カタログ [G5 / Phase 1a]
 *
 * DB (`inspection_measurements`) は field_code を汎用 text として持つ。様式の測定セルの
 * 正準定義（コード・ラベル・値種別・単位・様式別の該当）はこのアプリ層カタログが担う。
 * 様式改定はこのカタログの更新（data）で吸収し、DB スキーマは変えない。
 *
 * 出典: 指定自動車整備事業規則 第三号様式（四輪）／第四号様式（二輪）（第十条の二関係、
 * 令和6年10月版）。単位切替（制動力 N⇔kg 等）は様式備考どおり `units` に併記。
 */

export const INDICATED_INSPECTION_FORMS = ["sanago", "yonago"] as const;
export type IndicatedInspectionForm = (typeof INDICATED_INSPECTION_FORMS)[number]; // sanago=第三号(四輪) / yonago=第四号(二輪)

export type MeasurementValueKind = "numeric" | "judgment" | "text";

export interface MeasurementFieldDef {
  code: string;
  label: string;
  valueKind: MeasurementValueKind;
  units?: string[]; // 許容単位（先頭が既定）。単位を持たない項目は省略
  forms: IndicatedInspectionForm[]; // この項目が現れる様式
}

const BOTH: IndicatedInspectionForm[] = ["sanago", "yonago"];
const SANAGO: IndicatedInspectionForm[] = ["sanago"]; // 四輪のみ

/**
 * 測定セル定義。多くは両様式共通だが、各様式に固有のセルがある（包含関係ではない）:
 * 四輪(第三号)のみ = 軸ごと左右の制動力・駐車制動・左右差・サイドスリップ・OBD・黒煙、
 * 二輪(第四号)のみ = 制動力を前軸/後軸の集約値で持つ(brake.front/brake.rear)。
 * 各項目の該当様式は forms で表す。
 * ponytail: 光軸の上下/左右ズレの細分は初版では aim 1セル/灯にまとめる（描画で十分）。
 * 必要になれば code を足すだけ（DB 変更不要）。
 */
export const MEASUREMENT_FIELDS: readonly MeasurementFieldDef[] = [
  // --- 制動力（四輪は軸ごと左右、二輪は前後のみ）---
  {
    code: "brake.front_front.right",
    label: "制動力 前前軸 右",
    valueKind: "numeric",
    units: ["N", "kg"],
    forms: SANAGO,
  },
  {
    code: "brake.front_front.left",
    label: "制動力 前前軸 左",
    valueKind: "numeric",
    units: ["N", "kg"],
    forms: SANAGO,
  },
  {
    code: "brake.rear_front.right",
    label: "制動力 後前軸 右",
    valueKind: "numeric",
    units: ["N", "kg"],
    forms: SANAGO,
  },
  { code: "brake.rear_front.left", label: "制動力 後前軸 左", valueKind: "numeric", units: ["N", "kg"], forms: SANAGO },
  {
    code: "brake.front_rear.right",
    label: "制動力 前後軸 右",
    valueKind: "numeric",
    units: ["N", "kg"],
    forms: SANAGO,
  },
  { code: "brake.front_rear.left", label: "制動力 前後軸 左", valueKind: "numeric", units: ["N", "kg"], forms: SANAGO },
  { code: "brake.rear_rear.right", label: "制動力 後後軸 右", valueKind: "numeric", units: ["N", "kg"], forms: SANAGO },
  { code: "brake.rear_rear.left", label: "制動力 後後軸 左", valueKind: "numeric", units: ["N", "kg"], forms: SANAGO },
  { code: "brake.front", label: "制動力 前軸", valueKind: "numeric", units: ["N", "kg"], forms: ["yonago"] },
  { code: "brake.rear", label: "制動力 後軸", valueKind: "numeric", units: ["N", "kg"], forms: ["yonago"] },
  { code: "brake.total", label: "制動力 計", valueKind: "numeric", units: ["N", "kg"], forms: BOTH },
  {
    code: "brake.parking.right",
    label: "駐車制動力（手動）右",
    valueKind: "numeric",
    units: ["N", "kg"],
    forms: SANAGO,
  },
  {
    code: "brake.parking.left",
    label: "駐車制動力（手動）左",
    valueKind: "numeric",
    units: ["N", "kg"],
    forms: SANAGO,
  },
  { code: "brake.axle_weight.front", label: "軸重 前", valueKind: "numeric", units: ["kg"], forms: BOTH },
  { code: "brake.axle_weight.rear", label: "軸重 後", valueKind: "numeric", units: ["kg"], forms: BOTH },
  { code: "brake.lr_diff.front", label: "左右差 前", valueKind: "numeric", units: ["N", "N/kg", "%"], forms: SANAGO },
  { code: "brake.lr_diff.rear", label: "左右差 後", valueKind: "numeric", units: ["N", "N/kg", "%"], forms: SANAGO },
  { code: "vehicle_weight", label: "車両重量", valueKind: "numeric", units: ["kg"], forms: BOTH },

  // --- 前照灯・前部霧灯 ---
  { code: "headlight.mount_height", label: "前照灯 取付高さ", valueKind: "numeric", units: ["cm"], forms: BOTH },
  {
    code: "headlight.intensity.right.main",
    label: "前照灯 光度 右 主",
    valueKind: "numeric",
    units: ["cd"],
    forms: BOTH,
  },
  {
    code: "headlight.intensity.right.sub",
    label: "前照灯 光度 右 副",
    valueKind: "numeric",
    units: ["cd"],
    forms: BOTH,
  },
  {
    code: "headlight.intensity.left.main",
    label: "前照灯 光度 左 主",
    valueKind: "numeric",
    units: ["cd"],
    forms: BOTH,
  },
  {
    code: "headlight.intensity.left.sub",
    label: "前照灯 光度 左 副",
    valueKind: "numeric",
    units: ["cd"],
    forms: BOTH,
  },
  { code: "headlight.aim.right", label: "前照灯 光軸 右", valueKind: "text", forms: BOTH },
  { code: "headlight.aim.left", label: "前照灯 光軸 左", valueKind: "text", forms: BOTH },
  { code: "fog_lamp.right", label: "前部霧灯 右", valueKind: "numeric", units: ["cd"], forms: BOTH },
  { code: "fog_lamp.left", label: "前部霧灯 左", valueKind: "numeric", units: ["cd"], forms: BOTH },

  // --- その他計測 ---
  { code: "horn_db", label: "警音器", valueKind: "numeric", units: ["dB"], forms: BOTH },
  { code: "speedometer_error", label: "速度計の誤差", valueKind: "numeric", units: ["km/h"], forms: BOTH },
  { code: "exhaust_noise_db", label: "排気騒音", valueKind: "numeric", units: ["dB"], forms: BOTH },
  { code: "co", label: "排出ガス CO", valueKind: "numeric", units: ["%"], forms: BOTH },
  { code: "hc", label: "排出ガス HC", valueKind: "numeric", units: ["ppm"], forms: BOTH },
  { code: "diesel_smoke", label: "黒煙・粒子状物質", valueKind: "numeric", units: ["%"], forms: SANAGO },
  { code: "obd_result", label: "OBD 検査結果", valueKind: "judgment", forms: SANAGO },
  { code: "tire_runout", label: "タイヤの振れ", valueKind: "judgment", forms: BOTH },
  { code: "side_slip", label: "サイド・スリップ", valueKind: "text", units: ["mm/m"], forms: SANAGO },
] as const;

const FIELD_BY_CODE = new Map(MEASUREMENT_FIELDS.map((f) => [f.code, f]));

export function getMeasurementField(code: string): MeasurementFieldDef | undefined {
  return FIELD_BY_CODE.get(code);
}

export function isKnownMeasurementCode(code: string): boolean {
  return FIELD_BY_CODE.has(code);
}

/** 指定様式（sanago/yonago）に現れる測定項目のみ返す */
export function measurementFieldsForForm(form: IndicatedInspectionForm): MeasurementFieldDef[] {
  return MEASUREMENT_FIELDS.filter((f) => f.forms.includes(form));
}

/**
 * 測定項目の表示グループ（フォームの見出し）。カタログと同じ場所で一元管理する。
 * ponytail: 接頭辞ベースの簡易分類。未知の接頭辞は「排出ガス・その他計測」に入る
 * （描画上は消えず、グループが既定になるだけ）。様式改定で新カテゴリが要るなら
 * MeasurementFieldDef に明示 group を持たせる方向で拡張する。
 */
export function measurementGroup(code: string): string {
  if (code.startsWith("brake.") || code === "vehicle_weight") return "制動力・軸重";
  if (code.startsWith("headlight.") || code.startsWith("fog_lamp.")) return "灯火（前照灯・前部霧灯）";
  return "排出ガス・その他計測";
}

/**
 * 1測定値の入力バリデーション。field_code はカタログ既知のもののみ許可し、
 * 単位はその項目の許容単位（定義があれば）に限定する。judgment 項目は num/text を
 * 取らず判定のみ、numeric 項目は num_value を要求する、といった値種別の整合も検証する。
 */
export const measurementInputSchema = z
  .object({
    field_code: z.string().refine(isKnownMeasurementCode, { message: "未知の測定項目コードです。" }),
    num_value: z.number().finite().nullable().optional(),
    text_value: z.string().max(200).nullable().optional(),
    unit: z.string().max(16).nullable().optional(),
    judgment: z.enum(["pass", "fail", "na"]).nullable().optional(),
    source: z.enum(["manual", "imported"]).default("manual"),
    device: z.string().max(120).nullable().optional(),
    measured_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    const def = getMeasurementField(v.field_code);
    if (!def) return; // 既に refine で弾かれる
    if (v.unit) {
      if (!def.units) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["unit"],
          message: `「${def.label}」は単位を取りません。`,
        });
      } else if (!def.units.includes(v.unit)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["unit"],
          message: `「${def.label}」の単位は ${def.units.join(" / ")} のいずれかです。`,
        });
      }
    }
    if (def.valueKind === "numeric" && (v.num_value === null || v.num_value === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["num_value"],
        message: `「${def.label}」は数値の測定値が必要です。`,
      });
    }
    if (def.valueKind === "judgment" && !v.judgment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["judgment"],
        message: `「${def.label}」は良/否の判定が必要です。`,
      });
    }
    // text 項目（サイド・スリップ / 光軸）を含め、値が一切無い空の測定値は許さない。
    const hasNum = v.num_value !== null && v.num_value !== undefined;
    const hasText = v.text_value !== null && v.text_value !== undefined && v.text_value !== "";
    if (!hasNum && !hasText && !v.judgment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["field_code"],
        message: `「${def.label}」に測定値（数値・テキスト・判定のいずれか）が必要です。`,
      });
    }
  });

export type MeasurementInput = z.infer<typeof measurementInputSchema>;

/**
 * 完成検査記録の測定値をまとめて保存する PUT ボディ。フォームはその様式の全測定セルの
 * うち入力されたものを配列で送る（未入力セルは含めない＝置換保存の対象外）。
 * 同一 field_code の重複は許さない。
 */
export const measurementsPutSchema = z
  .object({
    measurements: z.array(measurementInputSchema).max(80, "測定項目が多すぎます。"),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    for (const m of v.measurements) {
      if (seen.has(m.field_code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["measurements"],
          message: `測定項目 ${m.field_code} が重複しています。`,
        });
      }
      seen.add(m.field_code);
    }
  });
export type MeasurementsPutInput = z.infer<typeof measurementsPutSchema>;
