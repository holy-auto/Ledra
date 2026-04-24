import { createServiceRoleAdmin } from "@/lib/supabase/admin";

/** Mask customer name for public display: 山田太郎 → 山田●● */
export function maskName(name: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return parts[0] + " " + "●".repeat(Math.min(parts.slice(1).join("").length, 4));
  }
  if (trimmed.length <= 2) return trimmed[0] + "●";
  return trimmed.slice(0, Math.ceil(trimmed.length / 2)) + "●".repeat(Math.floor(trimmed.length / 2));
}

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

type CertRow = {
  id: string;
  tenant_id: string;
  public_id: string;
  vehicle_id: string | null;
  status: string;
  customer_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  vehicle_info_json: Json | null;
  content_free_text: string | null;
  content_preset_json: Json | null;
  expiry_type: string | null;
  expiry_value: string | null;
  logo_asset_path: string | null;
  footer_variant: string | null;
  current_version: number | null;
  service_type: string | null;
  ppf_coverage_json: Json | null;
  coating_products_json: Json | null;
  warranty_period_end: string | null;
  warranty_exclusions: string | null;
  maintenance_json: Json | null;
  body_repair_json: Json | null;
};

type TenantRow = {
  name: string | null;
  slug: string | null;
  custom_domain: string | null;
};

type VehicleRow = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  customer_name: string | null;
  customer_email: string | null;
  notes: string | null;
};

type NfcRow = {
  id: string;
  tag_code: string | null;
  status: string | null;
  written_at: string | null;
  attached_at: string | null;
};

type HistoryRow = {
  id: string;
  type: string | null;
  title: string | null;
  description: string | null;
  performed_at: string | null;
  created_at: string | null;
};

type ImageRow = {
  id: string;
  file_name: string | null;
  content_type: string | null;
  file_size: number | null;
  sort_order: number | null;
  created_at: string | null;
  storage_path: string | null;
  authenticity_grade: string | null;
  sha256: string | null;
  polygon_tx_hash: string | null;
  polygon_network: string | null;
};

type VehicleCertRow = {
  id: string;
  public_id: string;
  status: string | null;
  customer_name: string | null;
  created_at: string | null;
  vehicle_info_json: Json | null;
  content_free_text: string | null;
  expiry_value: string | null;
};

export type PublicCertificateData = {
  ok: true;
  certificate: Omit<CertRow, "tenant_id" | "content_free_text"> & {
    tenant_id?: undefined;
    content_free_text?: undefined;
    customer_name: string | null;
  };
  vehicle: (Omit<VehicleRow, "customer_email" | "notes"> & { customer_email?: undefined; notes?: undefined }) | null;
  nfc: NfcRow | null;
  histories: HistoryRow[];
  images: (ImageRow & { url: string | null })[];
  vehicle_certificates: (Omit<VehicleCertRow, "content_free_text"> & {
    content_free_text?: undefined;
    customer_name: string | null;
  })[];
  vehicle_service_history_count: number;
  verification_url: string;
  days_until_expiry: number | null;
  warranty_active: boolean;
  shop: {
    name: string | null;
    slug: string | null;
    custom_domain: string | null;
  } | null;
};

/**
 * 公開証明書データを DB から直接取得する。
 * サーバーコンポーネント・Route Handler どちらからでも呼べる。
 * null → 証明書が存在しない (404 相当)
 */
export async function getPublicCertificateData(pid: string): Promise<PublicCertificateData | null> {
  const supabase = createServiceRoleAdmin("public certificate data — lookup by public_id, anonymous caller");

  const certRes = await supabase
    .from("certificates")
    .select(
      "id, tenant_id, public_id, vehicle_id, status, customer_name, created_at, updated_at, " +
        "vehicle_info_json, content_free_text, content_preset_json, expiry_type, expiry_value, " +
        "logo_asset_path, footer_variant, current_version, service_type, ppf_coverage_json, " +
        "coating_products_json, warranty_period_end, warranty_exclusions, " +
        "maintenance_json, body_repair_json",
    )
    .eq("public_id", pid)
    .limit(1)
    .maybeSingle<CertRow>();

  if (certRes.error) throw certRes.error;
  const cert = certRes.data;
  if (!cert?.tenant_id) return null;

  const [tenantRes, vehicleRes, nfcRes, histRes, imgRes, vcRes] = await Promise.all([
    supabase
      .from("tenants")
      .select("name, slug, custom_domain")
      .eq("id", cert.tenant_id)
      .limit(1)
      .maybeSingle<TenantRow>(),

    cert.vehicle_id
      ? supabase
          .from("vehicles")
          .select("id, maker, model, year, plate_display, customer_name, customer_email, notes")
          .eq("id", cert.vehicle_id)
          .limit(1)
          .maybeSingle<VehicleRow>()
      : Promise.resolve({ data: null as VehicleRow | null, error: null }),

    supabase
      .from("nfc_tags")
      .select("id, tag_code, status, written_at, attached_at")
      .eq("certificate_id", cert.id)
      .limit(1)
      .maybeSingle<NfcRow>(),

    cert.vehicle_id
      ? supabase
          .from("vehicle_histories")
          .select("id, type, title, description, performed_at, created_at")
          .eq("vehicle_id", cert.vehicle_id)
          .order("performed_at", { ascending: false })
          .limit(50)
          .returns<HistoryRow[]>()
      : Promise.resolve({ data: [] as HistoryRow[], error: null }),

    supabase
      .from("certificate_images")
      .select(
        "id, file_name, content_type, file_size, sort_order, created_at, storage_path, authenticity_grade, sha256, polygon_tx_hash, polygon_network",
      )
      .eq("certificate_id", cert.id)
      .order("sort_order", { ascending: true })
      .limit(20)
      .returns<ImageRow[]>(),

    cert.vehicle_id
      ? supabase
          .from("certificates")
          .select(
            "id, public_id, status, customer_name, created_at, vehicle_info_json, content_free_text, expiry_value",
          )
          .eq("vehicle_id", cert.vehicle_id)
          .neq("public_id", pid)
          .order("created_at", { ascending: false })
          .limit(20)
          .returns<VehicleCertRow[]>()
      : Promise.resolve({ data: [] as VehicleCertRow[], error: null }),
  ]);

  const tenant = tenantRes.data ?? null;
  const vehicle = vehicleRes.data ?? null;
  const nfc = nfcRes.data ?? null;
  const histories = histRes.data ?? [];
  const vehicle_certificates = vcRes.data ?? [];

  const images: (ImageRow & { url: string | null })[] = (!imgRes.error && imgRes.data ? imgRes.data : []).map((img) => {
    let url: string | null = null;
    if (img.storage_path) {
      const { data: signedData } = supabase.storage.from("certificate-images").getPublicUrl(img.storage_path);
      url = signedData?.publicUrl ?? null;
    }
    return { ...img, url };
  });

  const vehicleServiceHistoryCount = vehicle_certificates.length;
  const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/c/${cert.public_id}`;

  let daysUntilExpiry: number | null = null;
  if (cert.expiry_value) {
    const expiryDate = new Date(cert.expiry_value);
    if (!isNaN(expiryDate.getTime())) {
      daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }
  }

  const warrantyActive = cert.warranty_period_end != null && new Date(cert.warranty_period_end).getTime() > Date.now();

  return {
    ok: true,
    certificate: {
      ...cert,
      tenant_id: undefined as undefined,
      content_free_text: undefined as undefined,
      customer_name: maskName(cert.customer_name),
    },
    vehicle: vehicle ? { ...vehicle, customer_email: undefined as undefined, notes: undefined as undefined } : null,
    nfc,
    histories,
    images,
    vehicle_certificates: vehicle_certificates.map((vc) => ({
      ...vc,
      content_free_text: undefined as undefined,
      customer_name: maskName(vc.customer_name),
    })),
    vehicle_service_history_count: vehicleServiceHistoryCount,
    verification_url: verificationUrl,
    days_until_expiry: daysUntilExpiry,
    warranty_active: warrantyActive,
    shop: tenant
      ? {
          name: tenant.name ?? tenant.slug ?? null,
          slug: tenant.slug ?? null,
          custom_domain: tenant.custom_domain ?? null,
        }
      : null,
  };
}
