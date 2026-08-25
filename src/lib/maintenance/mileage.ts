/**
 * Odometer reading (km) attached to a certificate.
 *
 * One definition shared by the client form and the server action so the two
 * cannot disagree about what counts as a valid entry. The DB trigger
 * `fn_sync_mileage_from_certificate` drops anything `null` or `<= 0` when
 * copying `certificates.maintenance_json->>'mileage'` into
 * `vehicle_mileage_logs`, so "valid here" has to mean "the trigger will keep
 * it" — otherwise the form would accept a value that silently never lands.
 */

/** Upper bound. Beyond this a reading is a typo (extra digit), not a car. */
export const MAX_MILEAGE_KM = 2_000_000;

/**
 * Parse a raw form value into a storable odometer reading.
 * Returns null for anything the trigger would discard or a human would call a
 * typo: blank, non-numeric, zero, negative, fractional, or absurdly large.
 */
export function parseMileageKm(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Number() over parseInt: parseInt("35000km") returns 35000, which would let
  // a fat-fingered unit through as if it were clean input.
  const n = Number(s);
  if (!Number.isInteger(n)) return null;
  if (n <= 0 || n > MAX_MILEAGE_KM) return null;
  return n;
}
