import { NextRequest, NextResponse } from "next/server";
import { apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type CertificateRow = {
  id: string;
  tenant_id: string;
  public_id: string;
  vehicle_id: string | null;
  status: string;
  customer_name: string | null;
  created_at: string;
  updated_at: string;
  vehicle_info_json: Record<string, unknown> | null;
  content_free_text: string | null;
  content_preset_json: Record<string, unknown> | null;
  expiry_type: string | null;
  expiry_value: string | null;
  logo_asset_path: string | null;
  footer_variant: string | null;
  current_version: number | null;
  service_type: string | null;
  ppf_coverage_json: Record<string, unknown> | null;
  coating_products_json: Record<string, unknown> | null;
  warranty_period_end: string | null;
  warranty_exclusions: string | null;
  maintenance_json: Record<string, unknown> | null;
  body_repair_json: Record<string, unknown> | null;
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
  created_at: string;
};

type ImageRow = {
  id: string;
  file_name: string | null;
  content_type: string | null;
  file_size: number | null;
  sort_order: number | null;
  created_at: string;
  storage_path: string | null;
};

type VehicleCertRow = {
  id: string;
  public_id: string;
  status: string;
  customer_name: string | null;
  created_at: string;
  vehicle_info_json: Record<string, unknown> | null;
  content_free_text: string | null;
  expiry_value: string | null;
};

/** Mask customer name for public display: 山田太郎 → 山田●● */
function maskName(name: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  // For names with spaces (like "山田 太郎"), show family name + mask given name
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return parts[0] + " " + "●".repeat(Math.min(parts.slice(1).join("").length, 4));
  }
  if (trimmed.length <= 2) return trimmed[0] + "●";
  return trimmed.slice(0, Math.ceil(trimmed.length / 2)) + "●".repeat(Math.floor(trimmed.length / 2));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Rate limit: 30 requests per IP per minute
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`public-status:${ip}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const pid = req.nextUrl.searchParams.get("pid") ?? req.nextUrl.searchParams.get("public_id");
    if (!pid) return apiValidationError("pid は必須です。");

    const supabase = getSupabaseAdmin();

    // ── Certificate ──────────────────────────────────────────────
    const certRes = await supabase
      .from("certificates")
      .select(
        "id, tenant_id, public_id, vehicle_id, status, customer_name, created_at, updated_at, " +
        "vehicle_info_json, content_free_text, content_preset_json, expiry_type, expiry_value, " +
        "logo_asset_path, footer_variant, current_version, service_type, ppf_coverage_json, " +
        "coating_products_json, warranty_period_end, warranty_exclusions, " +
        "maintenance_json, body_repair_json"
      )
      .eq("public_id", pid)
      .limit(1)
      .maybeSingle();

    if (certRes.error) {
      return apiInternalError(certRes.error, "public-status certificate fetch");
    }
    const cert = certRes.data as CertificateRow | null;
    if (!cert?.tenant_id) {
      return apiNotFound("証明書が見つかりません。");
    }

    // ── 関連データを並列取得（直列→並列で大幅高速化） ──────────
    const [tenantRes, vehicleRes, nfcRes, histRes, imgRes, vcRes] = await Promise.all([
      // Tenant / Shop
      supabase.from("tenants").select("name, slug, custom_domain")
        .eq("id", cert.tenant_id).limit(1).maybeSingle(),

      // Vehicle
      cert.vehicle_id
        ? supabase.from("vehicles")
            .select("id, maker, model, year, plate_display, notes")
            .eq("id", cert.vehicle_id).limit(1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      // NFC tag
      supabase.from("nfc_tags")
        .select("id, tag_code, status, written_at, attached_at")
        .eq("certificate_id", cert.id).limit(1).maybeSingle(),

      // Vehicle histories
      cert.vehicle_id
        ? supabase.from("vehicle_histories")
            .select("id, type, title, description, performed_at, created_at")
            .eq("vehicle_id", cert.vehicle_id)
            .order("performed_at", { ascending: false }).limit(50)
        : Promise.resolve({ data: [], error: null }),

      // Certificate images
      supabase.from("certificate_images")
        .select("id, file_name, content_type, file_size, sort_order, created_at, storage_path")
        .eq("certificate_id", cert.id)
        .order("sort_order", { ascending: true }).limit(20),

      // Same-vehicle past certificates
      cert.vehicle_id
        ? supabase.from("certificates")
            .select("id, public_id, status, customer_name, created_at, vehicle_info_json, content_free_text, expiry_value")
            .eq("vehicle_id", cert.vehicle_id).neq("public_id", pid)
            .order("created_at", { ascending: false }).limit(20)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const tenant = (tenantRes.data as TenantRow | null) ?? null;
    const vehicle = (vehicleRes.data as VehicleRow | null) ?? null;
    const nfc = (nfcRes.data as NfcRow | null) ?? null;
    const histories = ((histRes.data as HistoryRow[] | null) ?? []);
    const vehicle_certificates = ((vcRes.data as VehicleCertRow[] | null) ?? []);

    let images: (ImageRow & { url: string | null })[] = [];
    if (!imgRes.error && imgRes.data) {
      images = (imgRes.data as ImageRow[]).map((img) => {
        let url: string | null = null;
        if (img.storage_path) {
          const { data: signedData } = supabase.storage
            .from("certificate-images")
            .getPublicUrl(img.storage_path);
          url = signedData?.publicUrl ?? null;
        }
        return { ...img, url };
      });
    }

    // ── Computed fields ─────────────────────────────────────────
    const vehicleServiceHistoryCount = vehicle_certificates.length;

    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/c/${cert.public_id}`;

    let daysUntilExpiry: number | null = null;
    if (cert.expiry_value) {
      const expiryDate = new Date(cert.expiry_value);
      if (!isNaN(expiryDate.getTime())) {
        const now = new Date();
        daysUntilExpiry = Math.ceil(
          (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
      }
    }

    const warrantyActive =
      cert.warranty_period_end != null &&
      new Date(cert.warranty_period_end).getTime() > Date.now();

    return NextResponse.json(
      {
        ok: true,
        certificate: {
          ...cert,
          tenant_id: undefined,        // Don't expose internal tenant UUID
          content_free_text: undefined, // May contain internal shop notes
          customer_name: maskName(cert.customer_name),
        },
        vehicle: vehicle ? {
          ...vehicle,
          notes: undefined,
        } : null,
        nfc,
        histories,
        images,
        vehicle_certificates: vehicle_certificates.map((vc) => ({
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
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (e) {
    return apiInternalError(e, "public-status");
  }
}
