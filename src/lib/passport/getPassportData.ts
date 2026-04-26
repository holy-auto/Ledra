import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { buildExplorerUrl } from "@/lib/anchoring/providers";

export type PassportCertCard = {
  public_id: string;
  service_type: string | null;
  created_at: string | null;
  shop_name: string | null;
  anchored_image_count: number;
  primary_tx_hash: string | null;
  primary_tx_network: "polygon" | "amoy" | null;
  primary_explorer_url: string | null;
};

export type PassportData = {
  vin_code_normalized: string;
  display_maker: string | null;
  display_model: string | null;
  display_year: number | null;
  anchored_cert_count: number;
  tenant_count: number;
  first_seen_at: string;
  last_activity_at: string;
  certificates: PassportCertCard[];
};

type PassportRow = {
  vin_code_normalized: string;
  display_maker: string | null;
  display_model: string | null;
  display_year: number | null;
  anchored_cert_count: number;
  tenant_count: number;
  first_seen_at: string;
  last_activity_at: string;
};

export async function getPassportData(vinRaw: string): Promise<PassportData | null> {
  const vin = vinRaw.trim().toUpperCase();
  const admin = createServiceRoleAdmin("passport public page — /v/[vin], anonymous caller");

  const { data: passportRaw } = await admin
    .from("vehicle_passports")
    .select(
      "vin_code_normalized, display_maker, display_model, display_year, " +
        "anchored_cert_count, tenant_count, first_seen_at, last_activity_at",
    )
    .eq("vin_code_normalized", vin)
    .maybeSingle();
  const passport = passportRaw as PassportRow | null;
  if (!passport) return null;

  // All opt-in vehicles sharing this VIN
  const { data: vinVehiclesRaw } = await admin
    .from("vehicles")
    .select("id, tenant_id")
    .eq("vin_code_normalized", vin)
    .eq("passport_opt_out", false);
  const vinVehicles = (vinVehiclesRaw ?? []) as { id: string; tenant_id: string }[];
  if (!vinVehicles.length) return null;

  const vehicleIds = vinVehicles.map((v) => v.id);
  const tenantIds = [...new Set(vinVehicles.map((v) => v.tenant_id))];

  const [tenantsRes, certsRes] = await Promise.all([
    admin.from("tenants").select("id, name, slug").in("id", tenantIds),
    admin
      .from("certificates")
      .select("id, public_id, tenant_id, service_type, created_at")
      .in("vehicle_id", vehicleIds)
      .order("created_at", { ascending: true }),
  ]);

  const tenantMap = Object.fromEntries(
    ((tenantsRes.data ?? []) as { id: string; name: string | null; slug: string | null }[]).map((t) => [t.id, t]),
  );

  const certs = (certsRes.data ?? []) as {
    id: string;
    public_id: string;
    tenant_id: string;
    service_type: string | null;
    created_at: string | null;
  }[];
  if (!certs.length) return null;

  const certIds = certs.map((c) => c.id);

  const { data: anchoredImgs } = await admin
    .from("certificate_images")
    .select("certificate_id, polygon_tx_hash, polygon_network")
    .in("certificate_id", certIds)
    .not("polygon_tx_hash", "is", null);

  type ImgRow = { certificate_id: string; polygon_tx_hash: string; polygon_network: string | null };
  const imgsByCert = new Map<string, ImgRow[]>();
  for (const img of (anchoredImgs ?? []) as ImgRow[]) {
    const arr = imgsByCert.get(img.certificate_id) ?? [];
    arr.push(img);
    imgsByCert.set(img.certificate_id, arr);
  }

  const cards: PassportCertCard[] = [];
  for (const cert of certs) {
    const imgs = imgsByCert.get(cert.id);
    if (!imgs?.length) continue;
    const tenant = tenantMap[cert.tenant_id];
    const network = imgs[0].polygon_network === "amoy" || imgs[0].polygon_network === "polygon"
      ? (imgs[0].polygon_network as "polygon" | "amoy")
      : null;
    cards.push({
      public_id: cert.public_id,
      service_type: cert.service_type,
      created_at: cert.created_at,
      shop_name: tenant?.name ?? tenant?.slug ?? null,
      anchored_image_count: imgs.length,
      primary_tx_hash: imgs[0].polygon_tx_hash,
      primary_tx_network: network,
      primary_explorer_url: buildExplorerUrl(imgs[0].polygon_tx_hash, network),
    });
  }

  if (!cards.length) return null;

  return {
    vin_code_normalized: passport.vin_code_normalized,
    display_maker: passport.display_maker,
    display_model: passport.display_model,
    display_year: passport.display_year,
    anchored_cert_count: passport.anchored_cert_count,
    tenant_count: passport.tenant_count,
    first_seen_at: passport.first_seen_at,
    last_activity_at: passport.last_activity_at,
    certificates: cards,
  };
}

export function getServiceTypeLabel(serviceType: string | null): string {
  switch (serviceType) {
    case "ppf": return "PPF施工";
    case "coating": return "コーティング";
    case "body_repair": return "鈑金塗装";
    case "maintenance": return "車両整備";
    case "wrapping": return "ラッピング";
    default: return serviceType ?? "施工";
  }
}
