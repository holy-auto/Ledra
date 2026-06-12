import { z } from "zod";

/**
 * 組織管理 (多店舗グループ) のバリデーションスキーマ。
 *
 * DB スキーマは supabase/migrations/20260612000013_organizations.sql を参照。
 *   organizations        … 組織本体 (name / owner_id)
 *   organization_members … 組織に所属するテナント (店舗) の連結
 */

/** 組織作成 (POST /api/admin/organizations) */
export const organizationCreateSchema = z.object({
  name: z.string().trim().min(1, "組織名を入力してください。").max(120, "組織名は120文字以内で入力してください。"),
});
export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;

/** 組織名更新 (PATCH /api/admin/organizations) */
export const organizationUpdateSchema = z.object({
  id: z.string().uuid("組織IDが不正です。"),
  name: z.string().trim().min(1, "組織名を入力してください。").max(120, "組織名は120文字以内で入力してください。"),
});
export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;

/** メンバー (テナント) 追加 (POST /api/admin/organizations/[id]/members) */
export const organizationMemberAddSchema = z.object({
  tenant_id: z.string().uuid("店舗IDが不正です。"),
});
export type OrganizationMemberAddInput = z.infer<typeof organizationMemberAddSchema>;
