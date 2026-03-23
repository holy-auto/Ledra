import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: NextRequest) {
  try {
    // Rate limit: 30 requests per IP per minute
    const ip = getClientIp(req);
    const rl = checkRateLimit(`public-status:${ip}`, { limit: 30, windowSec: 60 });
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
        "coating_products_json, warranty_period_end, warranty_exclusions"
      )
      .eq("public_id", pid)
      .limit(1)
      .maybeSingle();

    if (certRes.error) {
      return apiInternalError(certRes.error, "public-status certificate fetch");
    }
    const cert = certRes.data as any;
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
            .select("id, maker, model, year, plate_display, customer_name, customer_email, notes")
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

    const tenant = (tenantRes.data as any) ?? null;
    const vehicle = (vehicleRes.data as any) ?? null;
    const nfc = (nfcRes.data as any) ?? null;
    const histories = ((histRes.data as any[]) ?? []);
    const vehicle_certificates = ((vcRes.data as any[]) ?? []);

    let images: any[] = [];
    if (!imgRes.error && imgRes.data) {
      images = (imgRes.data as any[]).map((img: any) => {
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

    return NextResponse.json(
      {
        ok: true,
        certificate: cert,
        vehicle,
        nfc,
        histories,
        images,
        vehicle_certificates,
        shop: tenant
          ? {
              name: (tenant as any).name ?? (tenant as any).slug ?? null,
              slug: (tenant as any).slug ?? null,
              custom_domain: (tenant as any).custom_domain ?? null,
            }
          : null,
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (e) {
    return apiInternalError(e, "public-status");
  }
}
