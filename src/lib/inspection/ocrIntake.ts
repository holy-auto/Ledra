/**
 * 点検写真 OCR の結果を「点検フォームへどう流し込むか」を決める純ロジック。
 *
 * OCR ルート (`/api/admin/inspection-records/ocr`) が返す値を、テンプレート項目
 * (自由ラベル) に対して次の方針で割り当てる:
 *   - ラベルが走行距離 / タイヤに一致する numeric 項目があればその値へ流し込む。
 *   - 一致する項目が無ければ特記事項 (notes) に要約行として追記する (取りこぼさない)。
 *   - タイヤは残溝以外の所見 (スリップサイン / 交換目安 / 劣化メモ) が豊富なので、
 *     numeric へ流し込んだ場合も要約を必ず notes に残す。
 *
 * 確定 (保存) は人が行う前提。ここは「下書きをどこに置くか」を決めるだけで、
 * DB も React state も触らない純関数なので単体テストしやすい。
 */
import type { TireAdvice } from "./inspectionOcrSchema";

export interface OcrIntakeItem {
  id: string;
  label: string;
  type: string;
}

/** OCR ルートの応答 (status=ok) のうち、流し込みに使う部分。 */
export interface InspectionOcrPayload {
  target: "odometer" | "tire";
  mileage_km: number | null;
  tread_depth_mm: number | null;
  slip_sign_exposed: boolean | null;
  condition_notes: string[];
  warnings: string[];
  tire_advice: TireAdvice | null;
}

export interface OcrIntakePlan {
  /** 流し込む numeric 項目 (見つかった場合)。 */
  fill?: { itemId: string; value: string };
  /** 特記事項へ追記する行。 */
  noteLines: string[];
  /** ユーザー向けフィードバック文。 */
  message: string;
}

const ODOMETER_LABEL = /走行|距離|odo|メーター|mileage|km/i;
const TIRE_LABEL = /タイヤ|残溝|溝|tire|tread/i;

const ADVICE_LABEL: Record<TireAdvice, string> = {
  replace_now: "要交換 (交換推奨)",
  replace_soon: "次回交換推奨",
  ok: "残溝良好",
  unknown: "",
};

function findNumericItem(items: OcrIntakeItem[], re: RegExp): OcrIntakeItem | undefined {
  return items.find((it) => it.type === "numeric" && re.test(it.label));
}

/**
 * OCR 結果とテンプレート項目から、フォームへの流し込み計画を返す。
 */
export function planInspectionOcrIntake(payload: InspectionOcrPayload, items: OcrIntakeItem[]): OcrIntakePlan {
  if (payload.target === "odometer") {
    if (payload.mileage_km == null) {
      return {
        noteLines: [],
        message: joinWarn("走行距離を読み取れませんでした。手動で入力してください。", payload.warnings),
      };
    }
    const item = findNumericItem(items, ODOMETER_LABEL);
    if (item) {
      return {
        fill: { itemId: item.id, value: String(payload.mileage_km) },
        noteLines: [],
        message: joinWarn(
          `走行距離 ${payload.mileage_km.toLocaleString()} km を「${item.label}」に入力しました。`,
          payload.warnings,
        ),
      };
    }
    return {
      noteLines: [`走行距離: ${payload.mileage_km.toLocaleString()} km`],
      message: joinWarn("走行距離を特記事項に追記しました（対応する点検項目が無いため）。", payload.warnings),
    };
  }

  // tire
  const hasAny =
    payload.tread_depth_mm != null || payload.slip_sign_exposed != null || payload.condition_notes.length > 0;
  if (!hasAny) {
    return {
      noteLines: [],
      message: joinWarn("タイヤの状態を読み取れませんでした。手動で入力してください。", payload.warnings),
    };
  }

  const summary = buildTireSummary(payload);
  const noteLines = [summary, ...payload.condition_notes.map((n) => `  - ${n}`)];

  const item = payload.tread_depth_mm != null ? findNumericItem(items, TIRE_LABEL) : undefined;
  if (item) {
    return {
      fill: { itemId: item.id, value: String(payload.tread_depth_mm) },
      noteLines,
      message: joinWarn(
        `残溝 ${payload.tread_depth_mm}mm を「${item.label}」に入力し、所見を特記事項に追記しました。`,
        payload.warnings,
      ),
    };
  }
  return {
    noteLines,
    message: joinWarn("タイヤの所見を特記事項に追記しました。", payload.warnings),
  };
}

/** タイヤ所見の 1 行要約を作る。 */
export function buildTireSummary(payload: InspectionOcrPayload): string {
  const parts: string[] = [];
  if (payload.tread_depth_mm != null) parts.push(`残溝 ${payload.tread_depth_mm}mm`);
  if (payload.slip_sign_exposed === true) parts.push("スリップサイン露出");
  if (payload.tire_advice && ADVICE_LABEL[payload.tire_advice]) parts.push(ADVICE_LABEL[payload.tire_advice]);
  return `タイヤ${parts.length ? ": " + parts.join(" / ") : "所見あり"}`;
}

function joinWarn(message: string, warnings: string[]): string {
  const w = warnings.filter((s) => s.trim());
  return w.length ? `${message}（注意: ${w.join(" / ")}）` : message;
}
