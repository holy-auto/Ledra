/**
 * 身分証 OCR — PII フィルタ / マイナンバー検出 trip wire.
 *
 * 純関数で実装し、テスト容易性を確保する.
 *
 * 役割:
 * 1. AI レスポンス全体を走査し、12 桁数字 (個人番号の特徴) が混入していたら
 *    全フィールドを破棄して reject (`scanForMyNumber`).
 * 2. address 等のテキストに本籍 / 保険者番号などの要配慮情報の痕跡があれば
 *    マスク (`stripSensitiveTokens`).
 * 3. 住所を「都道府県+市区町村」レベルまでに丸めるオプション (`coarsenAddress`).
 *
 * 重要: フィルタは「念のための二重防御」. プロンプト側でも禁止しているが、
 * モデルが指示に従わない場合のフェイルセーフとして必ず通す.
 */
import type { OcrFields, OcrResult } from "./ocrSchema";

/** 12 桁の数字を検出する正規表現. ハイフン区切り (4-4-4 等) も拾う. */
const MY_NUMBER_PATTERN = /(?<!\d)(?:\d[\s\-]?){11}\d(?!\d)/;

/** 本籍欄ラベル. address に紛れていた場合に検出する. */
const HONSEKI_PATTERN = /本\s*籍|registered\s*domicile/i;

/** 保険者番号 / 記号番号 / 枝番のラベル. */
const INSURANCE_NUMBER_PATTERN = /保険者番号|記号番号|被保険者番号|枝番|insurer\s*number/i;

/** 完全なパスポート番号 (英字2 + 数字7) のパターン. 下4桁以外をマスクする. */
const PASSPORT_NUMBER_PATTERN = /\b[A-Z]{2}\d{7}\b/g;

/**
 * 任意の文字列に 12 桁数字が含まれているか判定する.
 *
 * 郵便番号(7桁)や電話番号(10〜11桁)は誤検知しない. ハイフン入りの
 * 4-4-4 表記も検出する.
 */
export function containsMyNumber(value: string): boolean {
  if (!value) return false;
  // ハイフンと空白を除去した上で連続12桁数字を探す
  const normalized = value.replace(/[\s\-]/g, "");
  return /(?<!\d)\d{12}(?!\d)/.test(normalized) || MY_NUMBER_PATTERN.test(value);
}

/**
 * OcrResult 全体を再帰スキャンし、どこかに 12 桁数字が現れたら true.
 */
export function scanForMyNumber(result: OcrResult): boolean {
  const walk = (v: unknown): boolean => {
    if (typeof v === "string") return containsMyNumber(v);
    if (Array.isArray(v)) return v.some(walk);
    if (v && typeof v === "object") return Object.values(v).some(walk);
    return false;
  };
  return walk(result);
}

/**
 * テキストから本籍 / 保険者番号 / 完全パスポート番号などの痕跡を除去する.
 * 該当箇所は "[REDACTED]" に置換する.
 */
export function stripSensitiveTokens(value: string): string {
  if (!value) return value;
  let out = value;

  // 本籍ラベルとその後の値 (改行 or 全角空白までを丸ごと落とす)
  out = out.replace(/(本\s*籍[:：]?\s*)[^\n　]+/g, "$1[REDACTED]");

  // 保険者番号系のラベル + 数字
  out = out.replace(/(保険者番号|記号番号|被保険者番号|枝番)[:：]?\s*[\w\-]+/g, "$1[REDACTED]");

  // パスポート番号は下 4 桁のみ残す
  out = out.replace(PASSPORT_NUMBER_PATTERN, (m) => `XX***${m.slice(-4)}`);

  return out;
}

/**
 * 住所を「都道府県 + 市区町村」レベルまで丸める.
 * 番地以下は本人申告フィールドに任せる方針.
 *
 * "東京都渋谷区道玄坂1-2-3 渋谷ビル4F" → "東京都渋谷区"
 */
export function coarsenAddress(address: string): string {
  if (!address) return address;
  // 都道府県 + 市区町村 (区/市/町/村 のいずれか) までを抽出
  const m = address.match(/^(.+?[都道府県]).*?([^\s\d]+?[市区町村])/);
  if (m) return `${m[1]}${m[2]}`;
  return address;
}

/**
 * 受け取った OcrResult を整形して、永続化前提では「ない」前提で
 * フォーム自動入力に渡せる形に変換する.
 *
 * - マイナンバー混入 → 全フィールド破棄 + reject 理由を追加 + status=rejected
 * - 各 string フィールドに `stripSensitiveTokens` を適用
 * - address に本籍が紛れていれば address ごと破棄
 *
 * フォームに流す前に必ずこの関数を通すこと.
 */
export function sanitizeOcrResult(result: OcrResult): {
  sanitized: OcrResult;
  status: "ok" | "rejected";
} {
  if (scanForMyNumber(result)) {
    return {
      status: "rejected",
      sanitized: {
        ...result,
        fields: {},
        rejected_reasons: [
          ...result.rejected_reasons,
          "個人番号(マイナンバー)の痕跡が検出されたため、結果を破棄しました。",
        ],
      },
    };
  }

  const fields: OcrFields = { ...result.fields };

  // 住所に本籍が紛れていたら丸ごと破棄
  if (fields.address && HONSEKI_PATTERN.test(fields.address)) {
    delete fields.address;
    result.rejected_reasons.push("住所欄に本籍が含まれていたため除去しました。");
  }

  // 健康保険証の保険者番号系トークンが混入していないか
  if (fields.address && INSURANCE_NUMBER_PATTERN.test(fields.address)) {
    delete fields.address;
    result.rejected_reasons.push("住所欄に保険者番号系の情報が含まれていたため除去しました。");
  }

  // 残ったテキストにも念のため stripSensitiveTokens を通す
  if (fields.name) fields.name = stripSensitiveTokens(fields.name);
  if (fields.address) fields.address = stripSensitiveTokens(fields.address);

  return {
    status: "ok",
    sanitized: {
      ...result,
      fields,
    },
  };
}
