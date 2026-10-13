/**
 * 実証テスト: メーカーが施工店に案件割当・不具合報告できるのは、その施工店の応募が
 * 承認済みのプロジェクトに限る（DECISION_LOG 2026-10-04「応募は必須」）。
 *
 * 割当・報告は施工店の管理者へメールを出す（#1176）ため、宛先 tenant_id を body のまま
 * 信じると、メーカーが任意のテナントへメールを送れてしまう。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export const APPLICATION_REQUIRED_MESSAGE = "この施工店は、このプロジェクトへの応募が承認されていません。";

export async function hasApprovedApplication(
  admin: Supa,
  p: { manufacturerId: string; projectId: string; tenantId: string },
): Promise<boolean> {
  const { data, error } = await admin
    .from("ft_applications")
    .select("id")
    .eq("manufacturer_id", p.manufacturerId)
    .eq("project_id", p.projectId)
    .eq("tenant_id", p.tenantId)
    .eq("status", "approved")
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export type ApprovedTenant = { id: string; name: string | null };

type ApplicationRow = {
  tenant_id: string;
  status: string;
  tenants?: { name: string | null } | { name: string | null }[] | null;
};

/**
 * 応募一覧（`GET /api/manufacturer/field-test/applications` の行）から、割当できる施工店を重複なしで取り出す。
 * 割当フォームの選択肢に使う。条件は hasApprovedApplication と同じ（approved のみ）。
 */
export function approvedTenants(rows: readonly ApplicationRow[]): ApprovedTenant[] {
  const byId = new Map<string, ApprovedTenant>();
  for (const r of rows) {
    if (r.status !== "approved" || byId.has(r.tenant_id)) continue;
    const t = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants;
    byId.set(r.tenant_id, { id: r.tenant_id, name: t?.name ?? null });
  }
  return [...byId.values()];
}
