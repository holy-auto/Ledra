import type { createTenantScopedAdmin } from "@/lib/supabase/admin";

/**
 * 指定された inspection_record が自テナントの完成検査(inspection_type='completion')であることを検証する。
 * 測定値の書き込み（手入力 PUT / 外部取込 import）が共有する前段ガード。 [G5]
 */
export async function loadCompletionRecord(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  recordId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await admin
    .from("inspection_records")
    .select("id, inspection_type")
    .eq("tenant_id", tenantId)
    .eq("id", recordId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, message: "対象の点検記録が見つかりません。" };
  if ((data as { inspection_type: string }).inspection_type !== "completion") {
    return { ok: false, message: "完成検査以外の記録には測定値を保存できません。" };
  }
  return { ok: true };
}
