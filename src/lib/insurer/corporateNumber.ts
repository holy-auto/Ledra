/**
 * Corporate number (法人番号) validation utilities.
 *
 * Japanese corporate numbers are 13 digits with a check digit.
 * Format: 1 check digit + 12 digits
 *
 * Future: Can be integrated with GBiz (gBizINFO) or
 * National Tax Agency API for real-time verification.
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

/**
 * Placeholder for future GBiz API integration.
 * Would verify the corporate number against the national registry
 * and return company details.
 */
export async function verifyCorporateNumberViaApi(
  _corpNumber: string,
): Promise<{ verified: boolean; companyName?: string; address?: string } | null> {
  // TODO: Integrate with GBiz API (https://info.gbiz.go.jp/api/v1/)
  // or National Tax Agency API when ready.
  //
  // For now, return null to indicate API verification is not yet available.
  return null;
}
