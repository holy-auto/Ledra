"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { makePublicId } from "@/lib/publicId";
import { enqueueInsuranceCaseCreated } from "@/lib/qstash/publish";

export type CreateCertResult =
  | { ok: true; public_id: string }
  | { ok: false; error: string };

export async function createCertAction(formData: FormData): Promise<CreateCertResult> {
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id ?? null;
  if (!userId) return { ok: false, error: "unauthorized" };

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();
  const tenantId = mem?.tenant_id as string | undefined;
  if (!tenantId) return { ok: false, error: "no_tenant" };

  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("logo_asset_path")
    .eq("id", tenantId)
    .single();
  const tenantLogoPath = (tenantRow?.logo_asset_path as string | null) ?? null;

  const template_id = String(formData.get("template_id") || "");
  const template_name = String(formData.get("template_name") || "");

  let schema_snapshot: any = null;
  if (template_id) {
    const { data: tpl } = await supabase
      .from("templates")
      .select("schema_json")
      .eq("id", template_id)
      .eq("tenant_id", tenantId)
      .single();
    schema_snapshot = tpl?.schema_json ?? null;
  }

  const vehicle_id = String(formData.get("vehicle_id") || "").trim() || null;
  const customer_name = String(formData.get("customer_name") || "").trim();
  const model = String(formData.get("model") || "").trim();
  const plate = String(formData.get("plate") || "").trim();
  const content_free_text = String(formData.get("content_free_text") || "").trim();
  const expiry_value = String(formData.get("expiry_value") || "").trim();

  const customer_id = String(formData.get("customer_id") || "").trim() || null;

  // Film thickness JSON (optional)
  let film_thickness: any[] = [];
  try {
    const raw = String(formData.get("film_thickness_json") || "[]");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) film_thickness = parsed;
  } catch {
    // ignore parse errors — field is optional
  }

  // Coating products JSON (optional)
  let coating_products: any[] = [];
  try {
    const raw = String(formData.get("coating_products_json") || "[]");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) coating_products = parsed;
  } catch {
    // ignore parse errors — field is optional
  }

  if (!customer_name) return { ok: false, error: "customer_name_required" };
  if (!vehicle_id) return { ok: false, error: "vehicle_required" };

  // Collect template field values
  const values: Record<string, any> = {};
  for (const [k, v] of formData.entries()) {
    const key = String(k);
    if (!key.startsWith("f__")) continue;
    const fkey = key.slice(3);
    if (v === "on") { values[fkey] = true; continue; }
    const sv = String(v);
    if (values[fkey] === undefined) values[fkey] = sv;
    else if (Array.isArray(values[fkey])) values[fkey].push(sv);
    else values[fkey] = [values[fkey], sv];
  }

  const public_id = makePublicId();

  // Draft or active status
  const statusParam = String(formData.get("status") || "active").trim();
  const certStatus = statusParam === "draft" ? "draft" : "active";

  const { error } = await supabase.from("certificates").insert({
    tenant_id: tenantId,
    public_id,
    status: certStatus,
    customer_name,
    customer_id: customer_id ?? undefined,
    vehicle_id: vehicle_id ?? undefined,
    vehicle_info_json: { model, plate },
    content_free_text,
    content_preset_json: {
      template_id,
      template_name,
      schema_snapshot,
      values,
      ...(film_thickness.length > 0 ? { film_thickness } : {}),
    },
    coating_products_json: coating_products.length > 0 ? coating_products : [],
    expiry_type: "text",
    expiry_value,
    footer_variant: "holy",
    logo_asset_path: tenantLogoPath,
    created_by: userId,
  });

  if (error) return { ok: false, error: error.message };

  // Record vehicle history entry
  if (vehicle_id) {
    await supabase.from("vehicle_histories").insert({
      tenant_id: tenantId,
      vehicle_id,
      type: "certificate_issued",
      title: "施工証明書を発行",
      description: `Public ID: ${public_id}`,
      performed_at: new Date().toISOString(),
      certificate_id: null,
    });
  }

  // Enqueue async notification via QStash (non-blocking)
  if (certStatus === "active") {
    enqueueInsuranceCaseCreated({
      certificate_id: public_id, // will be resolved via public_id in handler
      public_id,
      tenant_id: tenantId,
      customer_name,
      vehicle_model: model,
      vehicle_plate: plate,
      service_type: template_name || content_free_text?.slice(0, 50) || "",
      created_by: userId,
    }).catch((e) => console.warn("[cert] QStash enqueue failed:", e));
  }

  return { ok: true, public_id };
}
