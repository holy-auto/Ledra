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

/**
 * 本社チーム (organization_users) 管理スキーマ。
 * org_owner はオーナー (organizations.owner_id) 専用の概念のため UI からは割当不可。
 * 割当可能なのは org_admin / org_viewer のみ。
 */
const assignableOrgRole = z.enum(["org_admin", "org_viewer"], {
  message: "ロールは org_admin / org_viewer のいずれかです。",
});

/** 本社チーム追加 (POST /api/admin/organizations/[id]/users) — メール招待 */
export const organizationUserAddSchema = z.object({
  email: z.string().trim().email("メールアドレスの形式が不正です。").max(254),
  role: assignableOrgRole.default("org_viewer"),
});
export type OrganizationUserAddInput = z.infer<typeof organizationUserAddSchema>;

/** 本社チームのロール変更 (PUT /api/admin/organizations/[id]/users) */
export const organizationUserRoleSchema = z.object({
  user_id: z.string().uuid("ユーザーIDが不正です。"),
  role: assignableOrgRole,
});
export type OrganizationUserRoleInput = z.infer<typeof organizationUserRoleSchema>;
