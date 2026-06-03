"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SettingsResult = { ok: true } | { ok: false; error: string };

const tenantSettingsSchema = z.object({
  name: z.string().trim().min(1, "店舗名は必須です").max(100, "店舗名は100文字以内で入力してください"),
  contact_email: z.string().trim().email("メールアドレスの形式が正しくありません").max(254).optional().or(z.literal("")),
  contact_phone: z
    .string()
    .trim()
    .regex(/^[\d\-\+\(\)\s]*$/, "電話番号に使用できない文字が含まれています")
    .max(20, "電話番号は20文字以内で入力してください")
    .optional()
    .or(z.literal("")),
  address: z.string().trim().max(200, "住所は200文字以内で入力してください").optional().or(z.literal("")),
  website_url: z
    .string()
    .trim()
    .url("URLの形式が正しくありません")
    .max(500, "URLは500文字以内で入力してください")
    .optional()
    .or(z.literal("")),
  registration_number: z.string().trim().max(50, "登録番号は50文字以内で入力してください").optional().or(z.literal("")),
  bank_name: z.string().trim().max(100).optional().or(z.literal("")),
  bank_branch_name: z.string().trim().max(100).optional().or(z.literal("")),
  bank_account_type: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["普通", "当座", "貯蓄"]).optional()),
  bank_account_number: z
    .string()
    .trim()
    .regex(/^\d*$/, "口座番号は数字のみ入力してください")
    .max(8, "口座番号は8桁以内で入力してください")
    .optional()
    .or(z.literal("")),
  bank_account_holder: z.string().trim().max(100).optional().or(z.literal("")),
});

async function getTenantId(supabase: SupabaseClient): Promise<string | null> {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return null;
  const { data } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();
  return (data?.tenant_id as string | null) ?? null;
}

export async function updateTenantSettingsAction(formData: FormData): Promise<SettingsResult> {
  const supabase = await createSupabaseServerClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, error: "unauthorized" };

  const raw = {
    name: String(formData.get("name") ?? ""),
    contact_email: formData.has("contact_email") ? String(formData.get("contact_email") ?? "") : undefined,
    contact_phone: formData.has("contact_phone") ? String(formData.get("contact_phone") ?? "") : undefined,
    address: formData.has("address") ? String(formData.get("address") ?? "") : undefined,
    website_url: formData.has("website_url") ? String(formData.get("website_url") ?? "") : undefined,
    registration_number: formData.has("registration_number")
      ? String(formData.get("registration_number") ?? "")
      : undefined,
    bank_name: formData.has("bank_name") ? String(formData.get("bank_name") ?? "") : undefined,
    bank_branch_name: formData.has("bank_branch_name") ? String(formData.get("bank_branch_name") ?? "") : undefined,
    bank_account_type: formData.has("bank_account_type")
      ? String(formData.get("bank_account_type") ?? "")
      : undefined,
    bank_account_number: formData.has("bank_account_number")
      ? String(formData.get("bank_account_number") ?? "")
      : undefined,
    bank_account_holder: formData.has("bank_account_holder")
      ? String(formData.get("bank_account_holder") ?? "")
      : undefined,
  };

  const parsed = tenantSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容に誤りがあります" };
  }
  const v = parsed.data;

  const payload: Record<string, unknown> = { name: v.name };
  if (raw.contact_email !== undefined) payload.contact_email = v.contact_email || null;
  if (raw.contact_phone !== undefined) payload.contact_phone = v.contact_phone || null;
  if (raw.address !== undefined) payload.address = v.address || null;
  if (raw.website_url !== undefined) payload.website_url = v.website_url || null;
  if (raw.registration_number !== undefined) payload.registration_number = v.registration_number || null;

  if (raw.bank_name !== undefined) {
    payload.bank_info = {
      bank_name: v.bank_name || null,
      branch_name: v.bank_branch_name || null,
      account_type: v.bank_account_type ?? "普通",
      account_number: v.bank_account_number || null,
      account_holder: v.bank_account_holder || null,
    };
  }

  const { error } = await supabase.from("tenants").update(payload).eq("id", tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { ok: true };
}
