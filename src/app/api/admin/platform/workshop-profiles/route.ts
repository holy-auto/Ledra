/**
 * 運営専用: 施工店の設備・資格（workshop_capability_profiles）の「検証済み」の付与・解除。
 *
 * - GET:  全施工店の設備・資格を運営ビューで一覧（検証の判断に使う中身と、検証済みの日時・検証者）。
 * - POST: 検証済み（verified_at・verified_by）を付ける／外す。
 *
 * セキュリティ:
 *   - isPlatformAdmin ゲート（super_admin もしくは運営テナントの owner/admin）。
 *   - verified_at・verified_by は DB トリガ workshop_cap_profiles_lock_verified_at が
 *     施工店（authenticated / anon）からの変更を据え置くため、ここは createPlatformScopedAdmin
 *     （service-role）で更新する = 運営だけが付けられる正規経路。
 *     施工店が中身を書き換えると、同じトリガで検証済みは外れる。
 *   - 操作は admin_audit_logs に記録する。
 */

import { z } from "zod";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
import { bestEffortWrite } from "@/lib/db/bestEffortWrite";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCaller(
  async (_req, { caller }) => {
    try {
      if (!isPlatformAdmin(caller)) return apiForbidden();

      const admin = createPlatformScopedAdmin(
        "admin/platform/workshop-profiles: 運営による施工店の設備・資格の検証のための一覧（全施工店・platform スコープ）",
      );
      const { data, error } = await admin
        .from("workshop_capability_profiles")
        .select("*, tenants(name)")
        .order("updated_at", { ascending: false });
      if (error) return apiInternalError(error, "platform workshop-profiles list");

      const profiles = (data ?? []).map((row) => {
        const { tenants, ...rest } = row as Record<string, unknown> & { tenants?: { name: string | null } | null };
        return { ...rest, tenant_name: tenants?.name ?? null };
      });
      return apiJson({ ok: true, profiles });
    } catch (e: unknown) {
      return apiInternalError(e, "platform workshop-profiles GET");
    }
  },
  { routeName: "admin/platform/workshop-profiles GET" },
);

const verifySchema = z.object({
  tenant_id: z.string().uuid("無効な施工店IDです。"),
  verified: z.boolean(),
});

export const POST = withCaller(
  async (req, { caller }) => {
    try {
      if (!isPlatformAdmin(caller)) return apiForbidden();

      const parsed = verifySchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const { tenant_id, verified } = parsed.data;

      const admin = createPlatformScopedAdmin(
        "admin/platform/workshop-profiles: 運営による施工店の設備・資格の検証済み（verified_at・verified_by）の付与/解除",
      );

      const { data: profile, error: pErr } = await admin
        .from("workshop_capability_profiles")
        .select("id, tenant_id")
        .eq("tenant_id", tenant_id)
        .maybeSingle();
      if (pErr) return apiInternalError(pErr, "platform workshop-profiles lookup");
      if (!profile) return apiNotFound("設備・資格が登録されていません。");

      const verified_at = verified ? new Date().toISOString() : null;
      const verified_by = verified ? caller.userId : null;
      const { error: uErr } = await admin
        .from("workshop_capability_profiles")
        .update({ verified_at, verified_by })
        .eq("tenant_id", tenant_id);
      if (uErr) return apiInternalError(uErr, "platform workshop-profiles verify update");

      // 監査ログ（失敗してもアクションは止めない）。actor_tenant_id 列は無いので meta に入れる
      await bestEffortWrite(
        admin.from("admin_audit_logs").insert({
          actor_id: caller.userId,
          action: verified ? "platform.workshop_profile.verify" : "platform.workshop_profile.unverify",
          target_type: "workshop_capability_profile",
          target_id: profile.id,
          meta: { actor_tenant_id: caller.tenantId, tenant_id, verified },
        }),
        "admin_audit_logs insert (workshop-profiles POST)",
      );

      return apiJson({ ok: true, tenant_id, verified_at, verified_by });
    } catch (e: unknown) {
      return apiInternalError(e, "platform workshop-profiles POST");
    }
  },
  { routeName: "admin/platform/workshop-profiles POST" },
);
