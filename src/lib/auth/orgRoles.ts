/**
 * 本社 (組織) 側の役割。テナント (店舗) 側の Role (roles.ts) とは別軸。
 *
 * エンタープライズ契約での権限方針:
 *   - 本社ユーザ (organization_users) は組織配下の全店舗を「横断閲覧」できる。
 *   - 各店舗データの「書込」は従来通り tenant_memberships が必要。
 *     => 本社以外は他店を変更できない。本社も既定では横断は閲覧のみ。
 *
 * 実際のアクセス制御は Postgres RLS (my_org_tenant_ids 等) が担保する。
 * 本ファイルは UI / API 層でのラベル表示・最小ランク判定の共通定義。
 */

export type OrgRole = "org_owner" | "org_admin" | "org_viewer";

export const ORG_ROLES: OrgRole[] = ["org_owner", "org_admin", "org_viewer"];

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  org_owner: "本社オーナー",
  org_admin: "本社管理者",
  org_viewer: "本社閲覧者",
};

const ORG_ROLE_RANK: Record<OrgRole, number> = {
  org_owner: 3,
  org_admin: 2,
  org_viewer: 1,
};

export function normalizeOrgRole(v: unknown): OrgRole {
  const s = String(v ?? "").toLowerCase();
  if (s === "org_owner") return "org_owner";
  if (s === "org_admin") return "org_admin";
  if (s === "org_viewer") return "org_viewer";
  return "org_viewer"; // 既定は最小権限 (閲覧のみ)
}

/** role が minRole 以上の権限を持つか */
export function hasMinOrgRole(role: OrgRole, minRole: OrgRole): boolean {
  return ORG_ROLE_RANK[role] >= ORG_ROLE_RANK[minRole];
}
