import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages";
import { normalizePlanTier, PHOTO_LIMITS } from "@/lib/billing/planFeatures";

export const runtime = "nodejs";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────
    const supabase = await createSupabaseServerClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: mem } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .limit(1)
      .single();
    const tenantId = (mem?.tenant_id as string | undefined) ?? null;
    if (!tenantId) {
      return NextResponse.json({ error: "no_tenant" }, { status: 400 });
    }

    // ── Plan tier → photo limit ───────────────────────────────────
    const { data: tenant } = await supabase
      .from("tenants")
      .select("plan_tier")
      .eq("id", tenantId)
      .single();
    const planTier = normalizePlanTier((tenant as any)?.plan_tier);
    const maxPhotos = PHOTO_LIMITS[planTier];

    // ── Parse multipart form ──────────────────────────────────────
    const form = await req.formData();
    const publicId = String(form.get("public_id") ?? "").trim();
    if (!publicId) {
      return NextResponse.json({ error: "missing public_id" }, { status: 400 });
    }

    const files = form.getAll("photos") as File[];
    if (files.length === 0) {
      return NextResponse.json({ ok: true, uploaded: 0 });
    }

    // ── Verify certificate belongs to this tenant ─────────────────
    const admin = createSupabaseAdminClient();
    const { data: cert } = await admin
      .from("certificates")
      .select("id, tenant_id")
      .eq("public_id", publicId)
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    if (!cert?.id) {
      return NextResponse.json({ error: "certificate_not_found" }, { status: 404 });
    }

    // ── Count existing images ─────────────────────────────────────
    const { count: existingCount } = await admin
      .from("certificate_images")
      .select("id", { count: "exact", head: true })
      .eq("certificate_id", cert.id);
    const existing = existingCount ?? 0;
    const remaining = maxPhotos - existing;

    if (remaining <= 0) {
      return NextResponse.json(
        { error: "photo_limit_reached", max: maxPhotos, plan: planTier },
        { status: 422 }
      );
    }

    // ── Upload files ───────────────────────────────────────────────
    const toUpload = files.slice(0, remaining);
    let uploaded = 0;

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i];
      if (!file || !file.size) continue;

      // Validate MIME
      const mime = file.type || "application/octet-stream";
      if (!ALLOWED_MIME.includes(mime)) continue;

      // Validate size
      if (file.size > MAX_FILE_BYTES) continue;

      const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const storagePath = `${tenantId}/${cert.id}/${Date.now()}_${i}.${ext}`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadError } = await admin.storage
        .from(CERTIFICATE_IMAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: mime,
          upsert: false,
        });

      if (uploadError) {
        console.error("storage upload error", uploadError);
        continue;
      }

      await admin.from("certificate_images").insert({
        certificate_id: cert.id,
        storage_path: storagePath,
        file_name: file.name || `photo_${i + 1}.${ext}`,
        content_type: mime,
        file_size: file.size,
        sort_order: existing + uploaded,
      });

      uploaded++;
    }

    return NextResponse.json({ ok: true, uploaded, max: maxPhotos, plan: planTier });
  } catch (e: any) {
    console.error("image upload error", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
