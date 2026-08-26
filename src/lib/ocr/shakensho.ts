/**
 * 車検証 (Vehicle Inspection Certificate) OCR parser
 *
 * Claude Vision を使って画像から構造化データを直接抽出する。
 * OCR → 正規表現 の二段ではなく、Vision モデルに JSON を返させる一段構成。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_VISION } from "@/lib/ai/client";
import { detectMagicByteMime } from "@/lib/media/magicBytes";

export interface ShakenshoData {
  /** 車名 (例: トヨタ) */
  maker?: string;
  /** 型式 (例: 6AA-MXPH15) */
  model?: string;
  /** 初度登録年月 — 和暦 or 西暦そのまま (例: 令和4年3月) */
  first_registration?: string;
  /** 車台番号 (例: MXPH15-0012345) */
  vin?: string;
  /** 長さ mm */
  length_mm?: number;
  /** 幅 mm */
  width_mm?: number;
  /** 高さ mm */
  height_mm?: number;
  /** 車両重量 kg */
  weight_kg?: number;
  /** 総排気量 cc */
  displacement_cc?: number;
  /** ナンバー表示 (例: 品川 300 あ 12-34) — 個人情報のため任意 */
  plate_display?: string;

  // ─── 二次元コード由来の追加フィールド（電子車検証 仕様書 2023.1版） ───

  /** 型式指定番号・類別区分番号（車両スペックDB検索の主キー） */
  model_code?: string;
  /** 自動車検査証の有効期間の満了する日 (YYYY-MM-DD) */
  expiry_date?: string;
  /** 原動機型式（エンジン型式） */
  engine_model?: string;
  /** 燃料の種類（例: "ガソリン", "軽油", "電気", "ガソリン・電気"） */
  fuel_type?: string;
  /** 車台番号打刻位置コード */
  chassis_punch_position?: string;
  /** 軸重 kg（前前・前後・後前・後後、各 10kg 単位を kg 換算） */
  axle_weights_kg?: {
    front_front?: number;
    front_rear?: number;
    rear_front?: number;
    rear_rear?: number;
  };
  /** 駆動方式（"全輪駆動" / "その他" / "一般車" / "設定値無し"） */
  drive_type?: string;
  /** 保安基準適用年月日 (YYYY-MM-DD) */
  safety_standard_date?: string;

  // ─── 強化抽出フィールド ───────────────────────────────────────────────

  /** 自動車の種別（例: "普通", "小型", "軽自動車", "大型特殊"） */
  vehicle_type?: string;
  /** 用途（"自家用" / "事業用"） */
  usage_type?: string;
  /** 所有者氏名・名称 (PII — 表示は任意) */
  owner_name?: string;
  /** 使用者氏名・名称 (PII — 所有者と異なる場合のみ) */
  user_name?: string;
  /** 外板の色（例: "白", "黒", "シルバー"）*/
  color?: string;
  /** 最大積載量 kg */
  max_payload_kg?: number;

  // ─── メタ情報 ────────────────────────────────────────────────────────

  /** OCR 全体の信頼度: "high" / "medium" / "low" */
  extraction_confidence?: "high" | "medium" | "low";
  /** フィールドごとの検証警告メッセージ */
  validation_warnings?: string[];
}

/**
 * Calculate vehicle size class from dimensions (mm).
 * Volume thresholds in cubic meters:
 *   SS: < 8.0, S: 8.0-10.0, M: 10.0-12.0, L: 12.0-14.0, LL: 14.0-16.0, XL: 16.0+
 *
 * **DB の `calc_size_class_from_volume()` と同じ答えを返すこと。**同じ規則が
 * 2箇所にあるので、`supabase/__tests__/sqlTsParity.test.ts` がマイグレーション
 * 本文から規則を読んで突き合わせている。片方だけ変えると落ちる。
 *
 * **小数第2位に丸めてから分類する。** SQL 側の呼び出しは4箇所とも
 * `ROUND((l*w*h)/1000000000, 2)` を渡し、`vehicle_size_master.volume_m3` 自体も
 * `numeric(5,2)` の生成列。丸めないと境界の直下で答えが割れる ——
 * 4400×1765×1545mm は生の体積 11.99847 で TS は "M"、DB は ROUND して 12.00 で
 * "L" になっていた。**サイズ区分は価格帯に効くので、これは金額が変わる。**
 *
 * 寸法が有限値でないときは **null**（SQL の `vol_m3 IS NULL THEN NULL` と同じ）。
 * 以前は必ず文字列を返していたので、NaN が来ると全比較が false になって
 * **"XL"（最も高い区分）** を返した。呼び出し元5箇所すべてが手前でガードして
 * いたので到達しなかったが、**ガードを5箇所に置くより関数側で1回弾く方が
 * 小さい**（CLAUDE.md「呼び出し元ごとでなく共有関数を1回直す」）。
 * 0 や負値は弾かない —— SQL は 0 を NULL 扱いせず `0 < 8.0` で "SS" を返すので、
 * ここで弾くと**新しいズレを作ってしまう。**
 */
export function calcSizeClass(
  length_mm: number | null | undefined,
  width_mm: number | null | undefined,
  height_mm: number | null | undefined,
): string | null {
  const dims = [length_mm, width_mm, height_mm];
  if (!dims.every((d) => typeof d === "number" && Number.isFinite(d))) return null;
  const raw = (length_mm! * width_mm! * height_mm!) / 1e9;
  const volume = Math.round(raw * 100) / 100; // SQL 側の ROUND(_, 2) と揃える
  if (volume < 8.0) return "SS";
  if (volume < 10.0) return "S";
  if (volume < 12.0) return "M";
  if (volume < 14.0) return "L";
  if (volume < 16.0) return "LL";
  return "XL";
}

type SupportedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

// Claude Vision が受け付ける 4 形式のみ。判定不能は従来どおり jpeg として渡す
// (Vision 側が最終的に弾く)。マジックバイト判定は共有ヘルパーに集約済み。
function detectMediaType(buf: Buffer): SupportedMediaType {
  const mime = detectMagicByteMime(buf);
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/gif" || mime === "image/webp"
    ? mime
    : "image/jpeg";
}

const SYSTEM_PROMPT = `あなたは日本の自動車車検証（自動車検査証）から情報を抽出する専門家です。
提供された画像から以下の項目を読み取り、JSONのみで回答してください。
読み取れない項目は値を null にしてください。推測や創作は絶対にしないでください。

回答形式（JSONのみ、コードフェンス不要）:
{
  "maker": "車名（例: トヨタ）| null",
  "model": "型式（例: 6AA-MXPH15）| null",
  "model_code": "型式指定番号・類別区分番号（例: 12345-0234）| null",
  "first_registration": "初度登録年月（例: 令和4年3月 もしくは 2022年3月）| null",
  "expiry_date": "自動車検査証の有効期間の満了する日（YYYY-MM-DD 形式）| null",
  "vin": "車台番号 | null",
  "length_mm": 長さのミリメートル数値 | null,
  "width_mm": 幅のミリメートル数値 | null,
  "height_mm": 高さのミリメートル数値 | null,
  "weight_kg": 車両重量のキログラム数値 | null,
  "displacement_cc": 総排気量のcc数値 | null,
  "fuel_type": "燃料の種類（例: ガソリン、軽油、電気、ガソリン・電気）| null",
  "plate_display": "自動車登録番号・車両番号（例: 品川 300 あ 12-34）| null",
  "vehicle_type": "自動車の種別（例: 普通、小型、軽自動車、大型特殊）| null",
  "usage_type": "用途（自家用 または 事業用）| null",
  "owner_name": "所有者の氏名・名称 | null",
  "user_name": "使用者の氏名・名称（所有者と同じ場合は null）| null",
  "color": "外板の色（例: 白、黒、シルバー）| null",
  "max_payload_kg": 最大積載量のキログラム数値（貨物車のみ）| null,
  "confidence": "high（主要フィールドを概ね読み取れた） / medium / low（ほとんど読み取れなかった）"
}

注意:
- 寸法・重量・排気量・積載量は整数で返す（車検証の値をそのまま）
- 長さ・幅・高さはミリメートル、重量・積載量はキログラム、排気量はcc
- 有効期間満了日は西暦 YYYY-MM-DD 形式（和暦は西暦に変換）
- 車検証以外の画像や、読み取り不能な場合は全項目 null で返す
- confidence: maker/model/vin/expiry_date のうち3つ以上読めたら high、1〜2つなら medium、0なら low`;

const ShakenshoRawSchema = z.object({
  maker: z.string().nullable(),
  model: z.string().nullable(),
  model_code: z.string().nullable(),
  first_registration: z.string().nullable(),
  expiry_date: z.string().nullable(),
  vin: z.string().nullable(),
  length_mm: z.number().nullable(),
  width_mm: z.number().nullable(),
  height_mm: z.number().nullable(),
  weight_kg: z.number().nullable(),
  displacement_cc: z.number().nullable(),
  fuel_type: z.string().nullable(),
  plate_display: z.string().nullable(),
  vehicle_type: z.string().nullable(),
  usage_type: z.string().nullable(),
  owner_name: z.string().nullable(),
  user_name: z.string().nullable(),
  color: z.string().nullable(),
  max_payload_kg: z.number().nullable(),
  confidence: z.enum(["high", "medium", "low"]).nullable(),
});
type ShakenshoRaw = z.infer<typeof ShakenshoRawSchema>;

/**
 * 抽出結果の整合性チェック (純関数)。
 * 矛盾・疑わしい値があれば警告文を返す。
 */
export function validateShakenshoData(data: ShakenshoData): string[] {
  const warnings: string[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();

  // VIN (車台番号) — 英数字 6〜20 文字が一般的
  if (data.vin) {
    if (!/^[A-Za-z0-9\-]{4,25}$/.test(data.vin)) {
      warnings.push(`車台番号の形式が不正の可能性があります: ${data.vin}`);
    }
  }

  // 初度登録年 — 1950〜currentYear+1 の範囲
  const regYear = extractFirstRegistrationYear(data.first_registration);
  if (regYear !== null && (regYear < 1950 || regYear > currentYear + 1)) {
    warnings.push(`初度登録年が範囲外です: ${regYear}年`);
  }

  // 車検満了日 — 過去 10 年〜未来 5 年の範囲
  if (data.expiry_date) {
    const expiryMs = Date.parse(data.expiry_date);
    if (!Number.isNaN(expiryMs)) {
      const expiryYear = new Date(expiryMs).getFullYear();
      if (expiryYear < currentYear - 10 || expiryYear > currentYear + 5) {
        warnings.push(`車検満了日が範囲外です: ${data.expiry_date}`);
      }
    }
  }

  // 寸法: 長さ > 幅 > 高さ かつ各値が合理的な範囲
  if (data.length_mm && data.length_mm < 2000) warnings.push(`車長が短すぎます: ${data.length_mm}mm`);
  if (data.width_mm && data.width_mm < 1000) warnings.push(`車幅が狭すぎます: ${data.width_mm}mm`);
  if (data.length_mm && data.width_mm && data.length_mm < data.width_mm) {
    warnings.push(`車長 (${data.length_mm}mm) が車幅 (${data.width_mm}mm) より短いのは異常です`);
  }

  // 車両重量: 軽自動車は通常 600〜900kg、一般乗用車は 1000〜3500kg
  if (data.weight_kg && (data.weight_kg < 400 || data.weight_kg > 25000)) {
    warnings.push(`車両重量が範囲外の可能性があります: ${data.weight_kg}kg`);
  }

  return warnings;
}

/**
 * 初度登録年月文字列から西暦年を抽出する。
 * - "2023-01", "2022年3月", "令和4年3月" など複数フォーマットに対応
 * - 抽出できない場合は null
 */
export function extractFirstRegistrationYear(firstRegistration: string | undefined): number | null {
  if (!firstRegistration) return null;

  const westernMatch = firstRegistration.match(/^(\d{4})/);
  if (westernMatch) {
    const y = parseInt(westernMatch[1], 10);
    if (y > 1900 && y < 2100) return y;
  }

  const eraPatterns: [RegExp, number][] = [
    [/令和\s*(\d+)/, 2018],
    [/平成\s*(\d+)/, 1988],
    [/昭和\s*(\d+)/, 1925],
    [/大正\s*(\d+)/, 1911],
  ];

  for (const [re, base] of eraPatterns) {
    const m = firstRegistration.match(re);
    if (m) return base + parseInt(m[1], 10);
  }

  return null;
}

/**
 * 解析ソース:
 * - "qr": 2Dコードのみで必須フィールドを満たした
 * - "ocr": QR が読めず Claude Vision OCR のみを使用
 * - "hybrid": QR + OCR の両方を使い結果をマージ（QR 優先）
 */
export type ShakenshoSource = "qr" | "ocr" | "hybrid";

export interface ShakenshoParseResult {
  data: ShakenshoData;
  source: ShakenshoSource;
}

export interface ParseShakenshoOptions {
  /**
   * 呼び出し側が必要とする必須フィールド。
   *
   * QR コードからこれら全てが取得できた場合のみ QR 単独で短絡する。
   * 欠落がある場合は Claude Vision OCR を併用し、QR を優先しつつ OCR で
   * 欠落を埋める（source='hybrid'）。
   *
   * 注意: QR は `maker` や寸法（length/width/height）を含まないため、
   * それらを必須にすると事実上常に OCR も走ることになる。
   */
  requireFields?: (keyof ShakenshoData)[];
}

function hasAllFields(
  data: Partial<ShakenshoData> | null | undefined,
  required: readonly (keyof ShakenshoData)[],
): boolean {
  if (!data) return false;
  return required.every((k) => {
    const v = data[k];
    return v !== undefined && v !== null && v !== "";
  });
}

/**
 * 車検証画像を解析する。
 *
 * 動作:
 * 1. 画像内の全 2D コード（QR2+QR3 等）を `decode2DCodes` で読み、
 *    `parseShakenshoCode` で結合パースする。
 * 2. `requireFields` が全て揃っていれば QR 単独の結果を返す（source='qr'）。
 * 3. 欠落がある、または QR が読めなかった場合は Claude Vision OCR を実行し、
 *    QR を優先しながらマージする（source='hybrid' または 'ocr'）。
 *
 * これにより QR にない `maker` や寸法などを OCR で補完でき、QR が半端に
 * 読めた場合でも呼び出し側のフィールドが null に退行しない。
 */
export async function parseShakenshoAuto(
  imageBuffer: Buffer,
  options: ParseShakenshoOptions = {},
): Promise<ShakenshoParseResult> {
  const { decode2DCodes, parseShakenshoCode } = await import("./shakensho-qr");

  const qrTexts = await decode2DCodes(imageBuffer);
  const qrData = qrTexts.length > 0 ? parseShakenshoCode(qrTexts.join("\n")) : null;

  const required = options.requireFields ?? [];
  if (qrData && hasAllFields(qrData, required)) {
    return { data: qrData, source: "qr" };
  }

  // QR が不足 or 読めず → OCR で補完。
  // ここに来た時点で「QR だけでは requireFields を満たせない」ことが確定しているので、
  // OCR (Vision) が落ちたら握りつぶさず投げる。QR の一部だけを返すと呼び出し側は
  // 「成功したが項目が足りない」と誤認し、基盤障害が UI にもログにも出ない。
  const ocrData = await parseShakensho(imageBuffer);
  if (!qrData) {
    return { data: ocrData, source: "ocr" };
  }

  // QR は MLIT 公式データなので共有フィールドは QR 優先でマージ
  const merged: ShakenshoData = { ...ocrData };
  for (const [key, value] of Object.entries(qrData) as Array<
    [keyof ShakenshoData, ShakenshoData[keyof ShakenshoData]]
  >) {
    if (value !== undefined && value !== null) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  // Re-validate after QR fields overwrite OCR fields
  merged.validation_warnings = validateShakenshoData(merged);
  return { data: merged, source: "hybrid" };
}

/**
 * 車検証画像を Claude Vision で解析し、構造化データを返す。
 *
 * Vision 呼び出しが失敗した場合は例外を投げる（空データを返さない）。
 * 「API キー未設定 / レート制限 / サーキットオープン」と「画像が読めない」を
 * 呼び出し側が区別できないと、UI が無反応になり原因を追えないため。
 *
 * @param imageBuffer - Raw image bytes (JPEG, PNG, GIF, WEBP)
 * @returns Parsed vehicle data
 * @throws Vision API 呼び出しに失敗したとき
 */
export async function parseShakensho(imageBuffer: Buffer): Promise<ShakenshoData> {
  const client = getAnthropicClient();
  const mediaType = detectMediaType(imageBuffer);
  const base64 = imageBuffer.toString("base64");

  const msg = await withRetry("anthropic", () =>
    client.messages.parse({
      model: AI_MODEL_VISION,
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: "この車検証画像から指定項目をJSONで抽出してください。" },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ShakenshoRawSchema) },
    }),
  );
  const raw: ShakenshoRaw | null = msg.parsed_output ?? null;

  const data: ShakenshoData = {};
  if (raw?.maker) data.maker = raw.maker;
  if (raw?.model) data.model = raw.model;
  if (raw?.model_code) data.model_code = raw.model_code;
  if (raw?.first_registration) data.first_registration = raw.first_registration;
  if (raw?.expiry_date) data.expiry_date = raw.expiry_date;
  if (raw?.vin) data.vin = raw.vin;
  if (typeof raw?.length_mm === "number" && raw.length_mm > 0) data.length_mm = raw.length_mm;
  if (typeof raw?.width_mm === "number" && raw.width_mm > 0) data.width_mm = raw.width_mm;
  if (typeof raw?.height_mm === "number" && raw.height_mm > 0) data.height_mm = raw.height_mm;
  if (typeof raw?.weight_kg === "number" && raw.weight_kg > 0) data.weight_kg = raw.weight_kg;
  if (typeof raw?.displacement_cc === "number" && raw.displacement_cc > 0) {
    data.displacement_cc = raw.displacement_cc;
  }
  if (raw?.fuel_type) data.fuel_type = raw.fuel_type;
  if (raw?.plate_display) data.plate_display = raw.plate_display;
  if (raw?.vehicle_type) data.vehicle_type = raw.vehicle_type;
  if (raw?.usage_type) data.usage_type = raw.usage_type;
  if (raw?.owner_name) data.owner_name = raw.owner_name;
  if (raw?.user_name) data.user_name = raw.user_name;
  if (raw?.color) data.color = raw.color;
  if (typeof raw?.max_payload_kg === "number" && raw.max_payload_kg > 0) data.max_payload_kg = raw.max_payload_kg;

  data.extraction_confidence = raw?.confidence ?? "low";
  data.validation_warnings = validateShakenshoData(data);

  return data;
}
