import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    const pid = req.nextUrl.searchParams.get("pid") ?? req.nextUrl.searchParams.get("public_id");
    if (!pid) return NextResponse.json({ error: "Missing pid" }, { status: 400 });

    const supabase = getSupabaseAdmin();

    // ── Certificate ──────────────────────────────────────────────
    const certRes = await supabase
      .from("certificates")
      .select(
        "id, tenant_id, public_id, vehicle_id, status, customer_name, created_at, updated_at, " +
        "vehicle_info_json, content_free_text, content_preset_json, expiry_type, expiry_value, " +
        "logo_asset_path, footer_variant, current_version"
      )
      .eq("public_id", pid)
      .limit(1)
      .maybeSingle();

    if (certRes.error) {
      return NextResponse.json({ error: "Failed to read certificate", detail: certRes.error.message }, { status: 500 });
    }
    const cert = certRes.data as any;
    if (!cert?.tenant_id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ── Tenant / Shop ─────────────────────────────────────────────
    const tenantRes = await supabase
      .from("tenants")
      .select("name, slug, custom_domain")
      .eq("id", cert.tenant_id)
      .limit(1)
      .maybeSingle();
    const tenant = (tenantRes.data as any) ?? null;

    // ── Vehicle ───────────────────────────────────────────────────
    let vehicle: any = null;
    if (cert.vehicle_id) {
      const vehicleRes = await supabase
        .from("vehicles")
        .select("id, maker, model, year, plate_display, customer_name, customer_email, notes")
        .eq("id", cert.vehicle_id)
        .limit(1)
        .maybeSingle();
      vehicle = (vehicleRes.data as any) ?? null;
    }

    // ── NFC tag ───────────────────────────────────────────────────
    let nfc: any = null;
    {
      const nfcRes = await supabase
        .from("nfc_tags")
        .select("id, tag_code, status, written_at, attached_at")
        .eq("certificate_id", cert.id)
        .limit(1)
        .maybeSingle();
      nfc = (nfcRes.data as any) ?? null;
    }

    // ── Vehicle histories (timeline) ──────────────────────────────
    let histories: any[] = [];
    if (cert.vehicle_id) {
      const histRes = await supabase
        .from("vehicle_histories")
        .select("id, type, title, description, performed_at, created_at")
        .eq("vehicle_id", cert.vehicle_id)
        .order("performed_at", { ascending: false })
        .limit(50);
      histories = (histRes.data as any[]) ?? [];
    }

    // ── Certificate images ────────────────────────────────────────
    let images: any[] = [];
    {
      const imgRes = await supabase
        .from("certificate_images")
        .select("id, file_name, content_type, file_size, sort_order, created_at, storage_path")
        .eq("certificate_id", cert.id)
        .order("sort_order", { ascending: true })
        .limit(20);

      if (!imgRes.error && imgRes.data) {
        images = imgRes.data.map((img: any) => {
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
    }

    // ── Same-vehicle past certificates ────────────────────────────
    let vehicle_certificates: any[] = [];
    if (cert.vehicle_id) {
      const vcRes = await supabase
        .from("certificates")
        .select(
          "id, public_id, status, customer_name, created_at, vehicle_info_json, " +
          "content_free_text, expiry_value"
        )
        .eq("vehicle_id", cert.vehicle_id)
        .neq("public_id", pid)
        .order("created_at", { ascending: false })
        .limit(20);
      vehicle_certificates = (vcRes.data as any[]) ?? [];
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
  } catch (e: any) {
    console.error("public-status failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
