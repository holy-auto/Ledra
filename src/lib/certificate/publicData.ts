import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

/**
 * 公開証明書データを DB から直接取得する。
 * サーバーコンポーネント・Route Handler どちらからでも呼べる。
 * null → 証明書が存在しない (404 相当)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPublicCertificateData(pid: string): Promise<Record<string, any> | null> {
  const supabase = getSupabaseAdmin();

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
    .maybeSingle();

  if (certRes.error) throw certRes.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cert = certRes.data as any;
  if (!cert?.tenant_id) return null;

  const [tenantRes, vehicleRes, nfcRes, histRes, imgRes, vcRes] = await Promise.all([
    supabase.from("tenants").select("name, slug, custom_domain").eq("id", cert.tenant_id).limit(1).maybeSingle(),

    cert.vehicle_id
      ? supabase
          .from("vehicles")
          .select("id, maker, model, year, plate_display, customer_name, customer_email, notes")
          .eq("id", cert.vehicle_id)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    supabase
      .from("nfc_tags")
      .select("id, tag_code, status, written_at, attached_at")
      .eq("certificate_id", cert.id)
      .limit(1)
      .maybeSingle(),

    cert.vehicle_id
      ? supabase
          .from("vehicle_histories")
          .select("id, type, title, description, performed_at, created_at")
          .eq("vehicle_id", cert.vehicle_id)
          .order("performed_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),

    supabase
      .from("certificate_images")
      .select(
        "id, file_name, content_type, file_size, sort_order, created_at, storage_path, authenticity_grade, sha256",
      )
      .eq("certificate_id", cert.id)
      .order("sort_order", { ascending: true })
      .limit(20),

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
      : Promise.resolve({ data: [], error: null }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = (tenantRes.data as any) ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vehicle = (vehicleRes.data as any) ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nfc = (nfcRes.data as any) ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const histories = (histRes.data as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vehicle_certificates = (vcRes.data as any[]) ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let images: any[] = [];
  if (!imgRes.error && imgRes.data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    images = (imgRes.data as any[]).map((img: any) => {
      let url: string | null = null;
      if (img.storage_path) {
        const { data: signedData } = supabase.storage.from("certificate-images").getPublicUrl(img.storage_path);
        url = signedData?.publicUrl ?? null;
      }
      return { ...img, url };
    });
  }

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
      tenant_id: undefined,
      content_free_text: undefined,
      customer_name: maskName(cert.customer_name),
    },
    vehicle: vehicle ? { ...vehicle, customer_email: undefined, notes: undefined } : null,
    nfc,
    histories,
    images,
    vehicle_certificates: vehicle_certificates.map((vc: any) => ({
      ...vc,
      content_free_text: undefined,
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
