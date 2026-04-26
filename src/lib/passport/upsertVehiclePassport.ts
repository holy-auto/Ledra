import { createServiceRoleAdmin } from "@/lib/supabase/admin";

/**
 * Called after a Polygon anchor succeeds for a certificate image.
 *
 * Finds the VIN for the certificate's vehicle and upserts the
 * `vehicle_passports` row, recomputing anchored_cert_count and
 * tenant_count from live DB state.
 *
 * Silently returns when:
 *  - certificate has no vehicle, or vehicle has no normalized VIN
 *  - the vehicle has passport_opt_out = true
 *  - there are no anchored certs for this VIN after the recount
 */
export async function upsertVehiclePassport(certId: string): Promise<void> {
  const admin = createServiceRoleAdmin("passport upsert — triggered by polygon anchor success");

  const { data: certRaw } = await admin
    .from("certificates")
    .select("vehicle_id")
    .eq("id", certId)
    .maybeSingle();
  const cert = certRaw as { vehicle_id: string | null } | null;
  if (!cert?.vehicle_id) return;

  const { data: vehicleRaw } = await admin
    .from("vehicles")
    .select("vin_code_normalized, maker, model, year, passport_opt_out")
    .eq("id", cert.vehicle_id)
    .maybeSingle();
  const vehicle = vehicleRaw as {
    vin_code_normalized: string | null;
    maker: string | null;
    model: string | null;
    year: number | null;
    passport_opt_out: boolean;
  } | null;
  if (!vehicle?.vin_code_normalized || vehicle.passport_opt_out) return;

  const vin = vehicle.vin_code_normalized;

  // All opt-in vehicles sharing this VIN (cross-tenant)
  const { data: vinVehiclesRaw } = await admin
    .from("vehicles")
    .select("id, tenant_id")
    .eq("vin_code_normalized", vin)
    .eq("passport_opt_out", false);
  const vinVehicles = (vinVehiclesRaw ?? []) as { id: string; tenant_id: string }[];
  if (!vinVehicles.length) return;

  const vehicleIds = vinVehicles.map((v) => v.id);

  // Certificates linked to those vehicles
  const { data: allCerts } = await admin
    .from("certificates")
    .select("id, tenant_id")
    .in("vehicle_id", vehicleIds);
  if (!allCerts?.length) return;

  const certIds = allCerts.map((c: { id: string }) => c.id);

  // Which certs have at least one anchored image?
  const { data: anchoredImgRows } = await admin
    .from("certificate_images")
    .select("certificate_id")
    .in("certificate_id", certIds)
    .not("polygon_tx_hash", "is", null);

  const anchoredCertIdSet = new Set(
    (anchoredImgRows ?? []).map((r: { certificate_id: string }) => r.certificate_id),
  );
  const anchoredCerts = allCerts.filter((c: { id: string }) => anchoredCertIdSet.has(c.id));

  const anchoredCertCount = anchoredCerts.length;
  const tenantCount = new Set(anchoredCerts.map((c: { tenant_id: string }) => c.tenant_id)).size;

  if (anchoredCertCount === 0) return;

  await admin.from("vehicle_passports").upsert(
    {
      vin_code_normalized: vin,
      display_maker: vehicle.maker ?? null,
      display_model: vehicle.model ?? null,
      display_year: vehicle.year ?? null,
      anchored_cert_count: anchoredCertCount,
      tenant_count: tenantCount,
      last_activity_at: new Date().toISOString(),
    },
    { onConflict: "vin_code_normalized" },
  );
}
