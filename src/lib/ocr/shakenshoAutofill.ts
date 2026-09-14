/**
 * 車検証 OCR / 二次元コードの応答を UI メッセージに変換する共通ヘルパ。
 *
 * `/api/vehicles/parse-shakken`（画像 OCR）と `/api/vehicles/parse-shakken-qr`
 * （二次元コード）は、読み取れなかった場合でも HTTP 200 + 全項目 null を返す。
 * 各画面がこれを個別に扱っていたため「何も起きない」＝原因不明の
 * 「読み取りが出来ない」になっていた。判定をここに集約する。
 */

export type ShakenshoExtracted = {
  maker?: string | null;
  model?: string | null;
  year?: number | null;
  vin_code?: string | null;
  plate_display?: string | null;
  expiry_date?: string | null;
  size_class?: string | null;
};

export interface ShakenshoAutofillResponse {
  extracted?: ShakenshoExtracted | null;
  /** テナントの AI 自動入力が OFF / コストキャップ超過で OCR を実行しなかった。 */
  ai_disabled?: boolean;
}

const FIELD_LABELS: [keyof ShakenshoExtracted, string][] = [
  ["maker", "メーカー"],
  ["model", "車種"],
  ["year", "年式"],
  ["plate_display", "ナンバー"],
  ["vin_code", "車体番号"],
  ["expiry_date", "車検満了日"],
  ["size_class", "サイズ"],
];

/**
 * 自動入力できた項目のラベル一覧を返す。
 *
 * `fields` を渡すと、その画面が実際に反映する項目だけを数える
 * (入力欄が無い項目が埋まっても「自動入力できた」とは言わない)。
 */
export function filledFieldLabels(
  extracted: ShakenshoExtracted | null | undefined,
  fields?: readonly (keyof ShakenshoExtracted)[],
): string[] {
  if (!extracted) return [];
  return FIELD_LABELS.filter(([key]) => {
    if (fields && !fields.includes(key)) return false;
    const v = extracted[key];
    return v !== null && v !== undefined && v !== "";
  }).map(([, label]) => label);
}

export interface AutofillMessage {
  type: "success" | "error";
  text: string;
}

/**
 * 応答から表示メッセージを決める。
 * - AI 自動入力 OFF: 設定が原因だと分かる文言を返す
 * - 1 項目でも入った: 成功
 * - 全部 null: 撮り直し / 手入力を促す
 */
export function autofillMessage(
  res: ShakenshoAutofillResponse | null | undefined,
  fields?: readonly (keyof ShakenshoExtracted)[],
): AutofillMessage {
  if (res?.ai_disabled) {
    return {
      type: "error",
      text: "AI自動入力が無効のため車検証を読み取れませんでした。設定 → AI自動入力 を確認してください（月次コスト上限に達している場合も無効になります）。",
    };
  }
  const filled = filledFieldLabels(res?.extracted, fields);
  if (filled.length > 0) {
    return { type: "success", text: `${filled.join("・")}を自動入力しました` };
  }
  return {
    type: "error",
    text: "車検証から情報を読み取れませんでした。文字が鮮明に写るよう撮り直すか、手入力してください。",
  };
}
