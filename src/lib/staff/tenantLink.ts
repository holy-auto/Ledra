import "server-only";

import crypto from "crypto";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import type { StaffPortfolioCertificate } from "@/lib/staff/portfolioDisclosure";
import { generateCode, normalizeCode } from "@/lib/staff/linkCode";

/**
 * 外注職人のテナント連携。
 *
 * 元請けが職人ごとにコードを発行し、外注が自分の Ledra で入力すると
 * staff_members.linked_tenant_id が埋まる。以後、外注は自分の管理画面から
 * **自分が作業した記録だけ**を見られる。
 *
 * 設計と制約はマイグレーション 20260906100002 のコメント。要点:
 *   - 外注も Ledra を使う前提（アカウント無しの経路は持たない）。
 *   - 顧客名は表示しない（開示列は portfolioDisclosure.ts）。
 *   - **他社に稼働先を見せない**。元請けは自テナントの staff_members しか読めないので
 *     A から「この外注は B でも働いている」は引けない。
 *     「この職人と連携しているテナント一覧」を返す関数をここに作らないこと。
 */

/** pepper は顧客ポータルと同じものを接頭辞でドメイン分離して流用（環境変数を増やさない）。 */
const PEPPER = process.env.CUSTOMER_AUTH_PEPPER!;

const INVITE_TTL_DAYS = 14;

export function staffLinkCodeHash(code: string): string {
  if (!PEPPER) throw new Error("Missing CUSTOMER_AUTH_PEPPER");
  return crypto
    .createHash("sha256")
    .update(`stafflink|v1|${normalizeCode(code)}|${PEPPER}`)
    .digest("hex");
}

function admin() {
  return createServiceRoleAdmin("staff tenant link — 連携コードの照合と本人向けの実績表示");
}

/** 1つの元請けから見た、その職人の実績。 */
export type LinkedWorkGroup = {
  client_name: string;
  staff_name: string;
  certificates: StaffPortfolioCertificate[];
};

export type LinkedWork = {
  groups: LinkedWorkGroup[];
  total_certificates: number;
};

/**
 * 連携コードを発行（再発行）する。**raw code を返すのはこの瞬間だけ**で、
 * DB にはハッシュしか残らない。紛失したら再発行する。
 */
export async function issueStaffLinkInvite(
  tenantId: string,
  staffMemberId: string,
  createdBy: string | null,
): Promise<{ code: string; expiresAt: string }> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString();
  const { error } = await admin()
    .from("staff_link_invites")
    .upsert(
      {
        tenant_id: tenantId,
        staff_member_id: staffMemberId,
        code_hash: staffLinkCodeHash(code),
        expires_at: expiresAt,
        redeemed_at: null,
        redeemed_by_tenant_id: null,
        created_by: createdBy,
        created_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,staff_member_id" },
    );
  if (error) throw new Error(`issueStaffLinkInvite failed: ${error.message}`);
  return { code, expiresAt };
}

export type RedeemResult =
  | { ok: true; client_name: string; staff_name: string }
  | { ok: false; reason: "invalid" | "expired" | "used" | "self" };

/**
 * 外注が自分のテナントでコードを入力して連携を成立させる。
 *
 * 相手（元請け）のテナント ID を知らなくても引き換えられるのがコード方式の要点。
 * 失敗理由は「無効」「期限切れ」「使用済み」を出し分ける —— ここは総当たりの的では
 * なく（コードは短命かつ 31^10）、伝達ミスの切り分けができないと運用で詰まるため。
 */
export async function redeemStaffLinkInvite(code: string, redeemingTenantId: string): Promise<RedeemResult> {
  const db = admin();
  const { data: invite } = await db
    .from("staff_link_invites")
    .select("id, tenant_id, staff_member_id, expires_at, redeemed_at")
    .eq("code_hash", staffLinkCodeHash(code))
    .maybeSingle();
  if (!invite) return { ok: false, reason: "invalid" };
  if (invite.redeemed_at) return { ok: false, reason: "used" };
  if (new Date(invite.expires_at as string).getTime() < Date.now()) return { ok: false, reason: "expired" };
  // 自テナントの職人に自テナントを連携させても意味が無い（DB 側にも同じ制約がある）。
  if (invite.tenant_id === redeemingTenantId) return { ok: false, reason: "self" };

  const { data: staff } = await db
    .from("staff_members")
    .select("id, name, is_active")
    .eq("id", invite.staff_member_id)
    .eq("tenant_id", invite.tenant_id)
    .maybeSingle();
  if (!staff?.is_active) return { ok: false, reason: "invalid" };

  const { error: linkError } = await db
    .from("staff_members")
    .update({ linked_tenant_id: redeemingTenantId })
    .eq("id", invite.staff_member_id)
    .eq("tenant_id", invite.tenant_id);
  if (linkError) throw new Error(`redeemStaffLinkInvite failed: ${linkError.message}`);

  await db
    .from("staff_link_invites")
    .update({ redeemed_at: new Date().toISOString(), redeemed_by_tenant_id: redeemingTenantId })
    .eq("id", invite.id);

  const { data: client } = await db.from("tenants").select("name, slug").eq("id", invite.tenant_id).maybeSingle();
  return {
    ok: true,
    client_name: String(client?.name ?? client?.slug ?? ""),
    staff_name: String(staff.name ?? ""),
  };
}

/**
 * 外注テナントから見た「自分が作業した記録」を、元請けごとにまとめて返す。
 *
 * 引くのは craftsman_staff_id が**自分に連携された職人行**である証明書だけ。
 * 元請けのテナント全体は見えない。開示列は portfolioDisclosure.ts の許可リスト。
 */
export async function listLinkedWork(subcontractorTenantId: string): Promise<LinkedWork> {
  const db = admin();
  const { data: staffRows } = await db
    .from("staff_members")
    .select("id, name, tenant_id, is_active")
    .eq("linked_tenant_id", subcontractorTenantId);

  const rows = (staffRows ?? []) as { id: string; name: string; tenant_id: string; is_active: boolean }[];
  // 元請けが「休止中」にした職人は連携も止まる（在籍管理に相乗りさせる）。
  const active = rows.filter((r) => r.is_active);
  if (active.length === 0) return { groups: [], total_certificates: 0 };

  const clientIds = [...new Set(active.map((r) => r.tenant_id))];
  const { data: clients } = await db.from("tenants").select("id, name, slug").in("id", clientIds);
  const clientName = new Map(
    ((clients ?? []) as { id: string; name: string | null; slug: string | null }[]).map((t) => [
      t.id,
      String(t.name ?? t.slug ?? ""),
    ]),
  );

  const groups: LinkedWorkGroup[] = [];
  for (const row of active) {
    const { data: certs } = await db
      .from("certificates")
      .select("public_id, service_type, created_at")
      .eq("tenant_id", row.tenant_id)
      .eq("craftsman_staff_id", row.id)
      .neq("status", "void")
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(500);
    groups.push({
      client_name: clientName.get(row.tenant_id) ?? "",
      staff_name: String(row.name ?? ""),
      certificates: (certs ?? []) as StaffPortfolioCertificate[],
    });
  }

  groups.sort((a, b) => b.certificates.length - a.certificates.length);
  return { groups, total_certificates: groups.reduce((n, g) => n + g.certificates.length, 0) };
}

/** 元請け側から連携を解除する。職人行はそのまま、繋がりだけ切る。 */
export async function unlinkStaffTenant(tenantId: string, staffMemberId: string): Promise<void> {
  const { error } = await admin()
    .from("staff_members")
    .update({ linked_tenant_id: null })
    .eq("tenant_id", tenantId)
    .eq("id", staffMemberId);
  if (error) throw new Error(`unlinkStaffTenant failed: ${error.message}`);
}
