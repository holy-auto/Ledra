"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createCertificate } from "@/lib/certificates/create";

export type { CreateCertResult } from "@/lib/certificates/create";

/**
 * 発行画面（Web）から呼ばれる Server Action。
 * 本体は `@/lib/certificates/create` にあり、モバイルの
 * `/api/mobile/certificates` も同じ関数を通る。
 */
export async function createCertAction(
  formData: FormData,
): Promise<import("@/lib/certificates/create").CreateCertResult> {
  const supabase = await createSupabaseServerClient();

  // 画面表示と同じ active テナントで解決する (スキャンした別店舗の車両で発行しても
  // first-membership 側に作られる/失敗するのを防ぐ)。
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return { ok: false, error: "unauthorized" };

  return createCertificate(supabase, caller, formData);
}
