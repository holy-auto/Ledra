/**
 * 車検証 (Vehicle Inspection Certificate) OCR
 *
 * Claude Vision API に画像を送り、構造化 JSON で車両情報を抽出する。
 * 正規表現パース不要 — LLM が文脈で判断するため新旧フォーマット両対応。
 */

import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Size class calculation (dimensions → SS/S/M/L/LL/XL)
// ---------------------------------------------------------------------------

/**
 * Calculate vehicle size class from dimensions (mm).
 *
 *   SS: < 8.0 m³
 *   S : 8.0 – 10.0
 *   M : 10.0 – 12.0
 *   L : 12.0 – 14.0
 *   LL: 14.0 – 16.0
 *   XL: 16.0+
 */
export function calcSizeClass(length_mm: number, width_mm: number, height_mm: number): string {
  const volume = (length_mm * width_mm * height_mm) / 1e9;
  if (volume < 8.0) return "SS";
  if (volume < 10.0) return "S";
  if (volume < 12.0) return "M";
  if (volume < 14.0) return "L";
  if (volume < 16.0) return "LL";
  return "XL";
}

// ---------------------------------------------------------------------------
// Claude Vision API call
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `あなたは日本の車検証（自動車検査証）を読み取る OCR アシスタントです。
渡された車検証の画像から、以下の項目を読み取り **JSON のみ** を返してください。
読み取れない項目は null にしてください。余計な説明は不要です。

{
  "maker": "車名（例: トヨタ）",
  "model": "型式（例: 6AA-MXPH15）",
  "first_registration": "初度登録年月（記載そのまま。例: 令和4年3月）",
  "vin": "車台番号（例: MXPH15-0012345）",
  "length_mm": 4540,
  "width_mm": 1740,
  "height_mm": 1490,
  "weight_kg": 1390,
  "displacement_cc": 1797
}

注意:
- 所有者名・住所・使用者など個人情報は絶対に抽出しないでください。
- ナンバー（登録番号）も抽出しないでください。
- 数値は半角数字で返してください。
- 新様式（ICカード型）と旧様式（A4用紙）の両方に対応してください。`;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY が設定されていません。.env.local に追加してください。");
  }
  return new Anthropic({ apiKey });
}

function detectMediaType(buf: Buffer): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  // Check magic bytes
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  if (buf[0] === 0x52 && buf[1] === 0x49) return "image/webp";
  // Default to jpeg
  return "image/jpeg";
}

/**
 * 車検証画像を Claude Vision API で解析し、車両情報を返す。
 */
export async function parseShakensho(imageBuffer: Buffer): Promise<ShakenshoData> {
  const client = getClient();
  const base64 = imageBuffer.toString("base64");
  const mediaType = detectMediaType(imageBuffer);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: "text",
            text: "この車検証の画像から車両情報を読み取って JSON で返してください。",
          },
        ],
      },
    ],
    system: SYSTEM_PROMPT,
  });

  // Extract text from response
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude API からテキスト応答がありません。");
  }

  // Parse JSON from response (strip markdown fences if present)
  const raw = textBlock.text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Claude API の応答を JSON としてパースできませんでした: ${raw.slice(0, 200)}`);
  }

  // Map to ShakenshoData (validate types, nulls → undefined)
  return {
    maker: typeof parsed.maker === "string" ? parsed.maker : undefined,
    model: typeof parsed.model === "string" ? parsed.model : undefined,
    first_registration: typeof parsed.first_registration === "string" ? parsed.first_registration : undefined,
    vin: typeof parsed.vin === "string" ? parsed.vin : undefined,
    length_mm: typeof parsed.length_mm === "number" ? parsed.length_mm : undefined,
    width_mm: typeof parsed.width_mm === "number" ? parsed.width_mm : undefined,
    height_mm: typeof parsed.height_mm === "number" ? parsed.height_mm : undefined,
    weight_kg: typeof parsed.weight_kg === "number" ? parsed.weight_kg : undefined,
    displacement_cc: typeof parsed.displacement_cc === "number" ? parsed.displacement_cc : undefined,
  };
}
