
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiJson, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

// 案件アサイン用の最小スタッフ一覧（連絡先・メモ・実績などの PII は含まない）。
// 予約担当を割り当てる reservations:view ロールが利用できるよう、roster API
// (/api/admin/staff, members:view) とは分離する。
// staff_members の SELECT は RLS で管理ロールに限定しているため、ここは
// サービスロールで tenant_id 限定 + 最小列のみを返す（PII は出さない）。
// 在籍/休止の双方を返す（休止中の担当者でも案件ヘッダーに名前を表示するため）。
export const GET = withCaller(
  async (_req, { caller }) => {
    try {

      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data, error } = await admin
        .from("staff_members")
        .select("id, name, kind, skills, is_active")
        .eq("tenant_id", caller.tenantId)
        .order("is_active", { ascending: false })
        .order("name", { ascending: true });
      if (error) return apiInternalError(error, "staff picker");

      return apiJson({ staff: (data ?? []).map((s) => ({ ...s, skills: s.skills ?? [] })) });
    } catch (e) {
      return apiInternalError(e, "staff picker");
    }
  },
  { permission: "reservations:view", routeName: "staff picker" },
);
