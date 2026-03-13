"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export type SettingsResult = { ok: true } | { ok: false; error: string };

async function getTenantId(supabase: any): Promise<string | null> {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return null;
  const { data } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();
  return (data?.tenant_id as string | null) ?? null;
}

export async function updateTenantSettingsAction(formData: FormData): Promise<SettingsResult> {
  const supabase = await createSupabaseServerClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, error: "unauthorized" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "店舗名は必須です" };

  // Build update payload — include extended fields only if present in the form
  const payload: Record<string, any> = { name };
  const contact_email = String(formData.get("contact_email") ?? "").trim();
  const contact_phone = String(formData.get("contact_phone") ?? "").trim();
  const address       = String(formData.get("address") ?? "").trim();
  const website_url   = String(formData.get("website_url") ?? "").trim();
  const registration_number = String(formData.get("registration_number") ?? "").trim();
  // Only include extended fields if the form sent them (columnsExist path)
  if (formData.has("contact_email")) payload.contact_email = contact_email || null;
  if (formData.has("contact_phone")) payload.contact_phone = contact_phone || null;
  if (formData.has("address"))       payload.address       = address || null;
  if (formData.has("website_url"))   payload.website_url   = website_url || null;
  if (formData.has("registration_number")) payload.registration_number = registration_number || null;

  if (formData.has("bank_name")) {
    payload.bank_info = {
      bank_name: String(formData.get("bank_name") ?? "").trim() || null,
      branch_name: String(formData.get("bank_branch_name") ?? "").trim() || null,
      account_type: String(formData.get("bank_account_type") ?? "").trim() || "普通",
      account_number: String(formData.get("bank_account_number") ?? "").trim() || null,
      account_holder: String(formData.get("bank_account_holder") ?? "").trim() || null,
    };
  }

  const { error } = await supabase
    .from("tenants")
    .update(payload)
    .eq("id", tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { ok: true };
}
