
import { z } from "zod";

import { apiJson, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
const settingsDefaultsSchema = z.object({
  default_warranty_exclusions: z.string().max(5000).default(""),
});

export const dynamic = "force-dynamic";

/** GET: テナントのデフォルト保証除外内容を取得 */
export const GET = withCaller(
  async (_req, { caller, supabase }) => {
    try {

      const { data, error } = await supabase
        .from("tenants")
        .select("default_warranty_exclusions")
        .eq("id", caller.tenantId)
        .single();

      if (error) {
        return apiInternalError(error, "admin/settings/defaults GET");
      }

      return apiJson({
        default_warranty_exclusions: data?.default_warranty_exclusions ?? "",
      });
    } catch (e: unknown) {
      return apiInternalError(e, "admin/settings/defaults GET");
    }
  },
  { routeName: "admin/settings/defaults GET" },
);

/** PUT: テナントのデフォルト保証除外内容を更新 */
export const PUT = withCaller(
  async (req, { caller, supabase }) => {
    try {
      // tenants.default_warranty_exclusions（テナント全体の既定値）の変更。
      // 呼び出し元は /admin/settings ではなく /admin/certificates/new の
      // 「デフォルトとして保存」(CertNewFormWrapper.tsx)。
      //
      // 代表判断 2026-09-04 でテナント設定は **owner のみ**に確定したので、
      // settings:edit（admin 以上）から owner 以上に上げた。DB 側も同じコミットで
      // tenants_update_owner_admin を落として owner のみにしている。
      // 片方だけ直すと、admin の保存が 0 行更新で成功扱いになる。

      const parsed = settingsDefaultsSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const { default_warranty_exclusions: value } = parsed.data;

      // .select() で更新行数を確認する。RLS で弾かれると error は null のまま 0 行になり、
      // これが無いと「嘘の成功」を返す。
      const { data: updated, error } = await supabase
        .from("tenants")
        .update({ default_warranty_exclusions: value })
        .eq("id", caller.tenantId)
        .select("id");

      if (error) {
        return apiInternalError(error, "admin/settings/defaults PUT");
      }
      if (!updated?.length) return apiForbidden();

      return apiJson({ ok: true });
    } catch (e: unknown) {
      return apiInternalError(e, "admin/settings/defaults PUT");
    }
  },
  { minRole: "owner", routeName: "admin/settings/defaults PUT" },
);
