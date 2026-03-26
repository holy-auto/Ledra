/**
 * 車検証 (Vehicle Inspection Certificate) OCR parser
 *
 * Uses Google Cloud Vision API to extract vehicle dimensions and metadata
 * from a scanned or photographed vehicle inspection certificate.
 */

export interface ShakenshoData {
  maker?: string;
  model?: string;
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;
  weight_kg?: number;
  displacement_cc?: number;
  first_registration?: string;
  vin?: string;
}

/**
 * Calculate vehicle size class from dimensions (mm).
 * Volume thresholds in cubic meters:
 *   SS: < 8.0, S: 8.0-10.0, M: 10.0-12.0, L: 12.0-14.0, LL: 14.0-16.0, XL: 16.0+
 */
export function calcSizeClass(
  length_mm: number,
  width_mm: number,
  height_mm: number,
): string {
  const volume = (length_mm * width_mm * height_mm) / 1e9;
  if (volume < 8.0) return "SS";
  if (volume < 10.0) return "S";
  if (volume < 12.0) return "M";
  if (volume < 14.0) return "L";
  if (volume < 16.0) return "LL";
  return "XL";
}

// ---------------------------------------------------------------------------
// Internal: Google Cloud Vision API call
// ---------------------------------------------------------------------------

interface VisionResponse {
  responses: Array<{
    textAnnotations?: Array<{
      description: string;
      locale?: string;
    }>;
    error?: { code: number; message: string };
  }>;
}

async function callVisionApi(imageBuffer: Buffer): Promise<string> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_CLOUD_VISION_API_KEY is not configured");
  }

  const base64 = imageBuffer.toString("base64");

  const body = {
    requests: [
      {
        image: { content: base64 },
        features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
        imageContext: { languageHints: ["ja"] },
      },
    ],
  };

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vision API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as VisionResponse;
  const annotation = json.responses?.[0];

  if (annotation?.error) {
    throw new Error(
      `Vision API returned error: ${annotation.error.message}`,
    );
  }

  // textAnnotations[0].description contains the full detected text
  return annotation?.textAnnotations?.[0]?.description ?? "";
}

// ---------------------------------------------------------------------------
// Internal: text parsing helpers
// ---------------------------------------------------------------------------

/** Extract a number from patterns like "4,540" or "4540" next to a label */
function extractNumber(text: string, label: string): number | undefined {
  // Try patterns: "長さ 4540", "長さ4,540", "長さ 4 540"
  const patterns = [
    new RegExp(`${label}[\\s.:]*([\\d,]+)`, "m"),
    new RegExp(`${label}[\\s.:]*([\\d]+[\\s][\\d]+)`, "m"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const cleaned = match[1].replace(/[,\s]/g, "");
      const num = parseInt(cleaned, 10);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return undefined;
}

/** Extract a text value next to a label */
function extractText(text: string, label: string): string | undefined {
  const pattern = new RegExp(`${label}[\\s.:]*([^\\n]+)`, "m");
  const match = text.match(pattern);
  if (match?.[1]) {
    return match[1].trim().split(/\s{2,}/)[0]?.trim() || undefined;
  }
  return undefined;
}

/**
 * Parse raw OCR text from a vehicle inspection certificate.
 * Exported for testing purposes.
 */
export function parseShakenshoText(rawText: string): ShakenshoData {
  const data: ShakenshoData = {};

  // Dimensions (mm)
  data.length_mm = extractNumber(rawText, "長さ");
  data.width_mm = extractNumber(rawText, "幅");
  data.height_mm = extractNumber(rawText, "高さ");

  // Weight (kg)
  data.weight_kg = extractNumber(rawText, "車両重量");

  // Displacement (cc)
  data.displacement_cc = extractNumber(rawText, "総排気量");
  if (!data.displacement_cc) {
    data.displacement_cc = extractNumber(rawText, "排気量");
  }

  // Maker / vehicle name
  data.maker = extractText(rawText, "車名");

  // Model code
  data.model = extractText(rawText, "型式");

  // VIN / chassis number
  data.vin = extractText(rawText, "車台番号");

  // First registration date
  data.first_registration = extractText(rawText, "初度登録年月");
  if (!data.first_registration) {
    data.first_registration = extractText(rawText, "初度登録");
  }

  return data;
}

/**
 * Parse a vehicle inspection certificate image using OCR.
 *
 * @param imageBuffer - Raw image bytes (JPEG, PNG, etc.)
 * @returns Parsed vehicle data
 */
export async function parseShakensho(
  imageBuffer: Buffer,
): Promise<ShakenshoData> {
  const rawText = await callVisionApi(imageBuffer);
  return parseShakenshoText(rawText);
}
