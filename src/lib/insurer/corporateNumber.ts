/**
 * Corporate number (法人番号) validation utilities.
 *
 * Japanese corporate numbers are 13 digits with a check digit.
 * Format: 1 check digit + 12 digits
 *
 * GBiz API integration for real-time verification:
 * Requires GBIZ_API_KEY environment variable.
 * https://info.gbiz.go.jp/api/v1/
 */

/**
 * Validate the format and check digit of a Japanese corporate number.
 * Returns true if valid, false if invalid.
 */
export function isValidCorporateNumber(corpNumber: string): boolean {
  const cleaned = corpNumber.replace(/[-\s]/g, "");

  // Must be exactly 13 digits
  if (!/^\d{13}$/.test(cleaned)) return false;

  // Check digit validation (Modulus 9)
  const digits = cleaned.split("").map(Number);
  const checkDigit = digits[0];
  const body = digits.slice(1);

  // Weights: odd positions (from right) get 1, even positions get 2
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const weight = (i % 2 === 0) ? 2 : 1;
    sum += body[11 - i] * weight;
  }

  const remainder = sum % 9;
  const expectedCheck = 9 - remainder;

  return checkDigit === expectedCheck;
}

/**
 * Format a corporate number for display (e.g., "1234567890123" → "1-2345-6789-0123")
 */
export function formatCorporateNumber(corpNumber: string): string {
  const cleaned = corpNumber.replace(/[-\s]/g, "");
  if (cleaned.length !== 13) return corpNumber;
  return `${cleaned[0]}-${cleaned.slice(1, 5)}-${cleaned.slice(5, 9)}-${cleaned.slice(9)}`;
}

/** GBiz API response shape (subset of fields we use) */
export type GBizCompanyInfo = {
  corporateNumber: string;
  name: string;
  location: string;
  representativeName: string;
  status: string;
};

/**
 * Verify a corporate number via the gBizINFO API and return company details.
 *
 * Requires env var GBIZ_API_KEY.
 * Returns null if the API key is not configured or the number is not found.
 */
export async function verifyCorporateNumberViaApi(
  corpNumber: string,
): Promise<GBizCompanyInfo | null> {
  const apiKey = process.env.GBIZ_API_KEY;
  if (!apiKey) return null;

  const cleaned = corpNumber.replace(/[-\s]/g, "");
  if (!/^\d{13}$/.test(cleaned)) return null;

  try {
    const res = await fetch(
      `https://info.gbiz.go.jp/hojin/v1/hojin/${cleaned}`,
      {
        headers: {
          "X-hojinInfo-api-token": apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!res.ok) return null;

    const json = await res.json();

    // gBizINFO returns { "hojin-infos": [ { ... } ] }
    const infos = json?.["hojin-infos"];
    if (!Array.isArray(infos) || infos.length === 0) return null;

    const info = infos[0];

    return {
      corporateNumber: info["corporate-number"] ?? cleaned,
      name: info["name"] ?? "",
      location: info["location"] ?? "",
      representativeName: info["representative-name"] ?? "",
      status: info["status"] ?? "",
    };
  } catch {
    // Network error or timeout — don't block registration
    console.warn("[gbiz] API call failed for", cleaned);
    return null;
  }
}
