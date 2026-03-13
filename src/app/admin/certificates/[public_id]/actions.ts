"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export type CertActionResult = { ok: true } | { ok: false; error: string };

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

export async function activateCertAction(publicId: string): Promise<CertActionResult> {
  const supabase = await createSupabaseServerClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, error: "unauthorized" };

  const { error } = await supabase
    .from("certificates")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("public_id", publicId)
    .eq("status", "draft");

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/certificates/${publicId}`);
  return { ok: true };
}

export async function voidCertAction(publicId: string): Promise<CertActionResult> {
  const supabase = await createSupabaseServerClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, error: "unauthorized" };

  const { error } = await supabase
    .from("certificates")
    .update({ status: "void", updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("public_id", publicId)
    .neq("status", "void");

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/certificates/${publicId}`);
  return { ok: true };
}
