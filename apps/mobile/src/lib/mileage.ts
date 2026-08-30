/**
 * Odometer reading (km) attached to a certificate.
 *
 * Mirror of `src/lib/maintenance/mileage.ts` in the web app — the mobile app
 * has no path alias into it (see apps/mobile/tsconfig.json), so the rule is
 * duplicated rather than imported. Keep the two in step: the DB trigger
 * `fn_sync_mileage_from_certificate` drops null and <= 0 when copying
 * `certificates.maintenance_json->>'mileage'` into `vehicle_mileage_logs`, so
 * both copies must reject exactly what the trigger would throw away.
 */

export const MAX_MILEAGE_KM = 2_000_000;

export function parseMileageKm(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isInteger(n)) return null;
  if (n <= 0 || n > MAX_MILEAGE_KM) return null;
  return n;
}
