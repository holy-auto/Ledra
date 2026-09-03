import "server-only";

import crypto from "crypto";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import type { StaffPortfolioCertificate } from "@/lib/staff/portfolioDisclosure";

/**
 * 職人の施工実績リンク（読み取り専用）。
 *
 * なぜ要るか: 外注職人はログインアカウントを持たない設計なので（staff_members.user_id
 * は外注では null）、施工した本人が自分の記録を確認する手段が Ledra 上に無かった。
 * 証明書には craftsman_staff_id が刻まれている（20260617000004）ので、材料はある。
 * 足りないのは本人へ渡す導線だけ。
 *
 * 設計と失効条件はマイグレーション 20260903000000 のコメント。
 * 店舗を跨いだ束ねは 20260903000001（**他社に稼働先が見えないこと**が制約）。
 */

/**
 * pepper は顧客ポータルと同じ CUSTOMER_AUTH_PEPPER を接頭辞でドメイン分離して流用する。
 * 新しい必須の環境変数を増やさないため（未設定なら顧客ポータルも動かないので運用上も同条件）。
 */
const PEPPER = process.env.CUSTOMER_AUTH_PEPPER!;

export function staffPortfolioTokenHash(token: string): string {
  if (!PEPPER) throw new Error("Missing CUSTOMER_AUTH_PEPPER");
  return crypto.createHash("sha256").update(`staffportfolio|v1|${token}|${PEPPER}`).digest("hex");
}

/** 1店舗分の実績。 */
export type StaffPortfolioShop = {
  /** 束ねの解除に使う。トークンを持っていない人には意味を持たない値。 */
  link_id: string;
  shop_name: string;
  staff_name: string;
  certificates: StaffPortfolioCertificate[];
};

export type StaffPortfolio = {
  staff_name: string;
  /** 本人が束ねた店舗すべて。束ねていなければ1件。 */
  shops: StaffPortfolioShop[];
  total_certificates: number;
};

type LinkRow = { id: string; tenant_id: string; staff_member_id: string; is_active: boolean };

function admin() {
  return createServiceRoleAdmin("staff portfolio link — token 照合と本人向けの実績表示");
}

type Db = ReturnType<typeof admin>;

/**
 * リンク1本を「今も有効か」まで含めて解決する。
 *
 * 有効条件は3つすべて: link.is_active / staff_members.is_active / 同一テナント。
 * 3つ目の staff.is_active があるので、ロスターで「休止中」にすればリンクは自動的に死ぬ。
 */
async function loadShop(db: Db, link: LinkRow): Promise<StaffPortfolioShop | null> {
  if (!link.is_active) return null;

  const [{ data: staff }, { data: tenant }] = await Promise.all([
    db
      .from("staff_members")
      .select("name, is_active")
      .eq("id", link.staff_member_id)
      .eq("tenant_id", link.tenant_id)
      .maybeSingle(),
    db.from("tenants").select("name, slug").eq("id", link.tenant_id).maybeSingle(),
  ]);
  if (!staff?.is_active) return null;

  const { data: certs } = await db
    .from("certificates")
    .select("public_id, service_type, created_at")
    .eq("tenant_id", link.tenant_id)
    .eq("craftsman_staff_id", link.staff_member_id)
    .neq("status", "void")
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(500);

  return {
    link_id: link.id,
    shop_name: String(tenant?.name ?? tenant?.slug ?? ""),
    staff_name: String(staff.name ?? ""),
    certificates: (certs ?? []) as StaffPortfolioCertificate[],
  };
}

async function linkByToken(db: Db, token: string): Promise<LinkRow | null> {
  const raw = token.trim();
  if (!raw) return null;
  const { data } = await db
    .from("staff_portfolio_links")
    .select("id, tenant_id, staff_member_id, is_active")
    .eq("token_hash", staffPortfolioTokenHash(raw))
    .maybeSingle();
  return (data as LinkRow | null) ?? null;
}

/** そのリンクが属する束ねの id（束ねていなければ null）。 */
async function identityOf(db: Db, linkId: string): Promise<string | null> {
  const { data } = await db
    .from("staff_portfolio_identity_members")
    .select("identity_id")
    .eq("portfolio_link_id", linkId)
    .maybeSingle();
  return (data?.identity_id as string | undefined) ?? null;
}

/** 束ねに属するリンク id をすべて返す。 */
async function linkIdsOfIdentity(db: Db, identityId: string): Promise<string[]> {
  const { data } = await db
    .from("staff_portfolio_identity_members")
    .select("portfolio_link_id")
    .eq("identity_id", identityId);
  return (data ?? []).map((r: { portfolio_link_id: string }) => String(r.portfolio_link_id));
}

/**
 * トークンから職人の実績を引く。無効なら null（理由は呼び出し元へ漏らさない）。
 *
 * 本人が束ねていれば複数店舗分を返す。**束ねの情報はテナントからは読めない場所**に
 * あるので、これを増やしても各テナントの見え方は変わらない（20260903000001）。
 */
export async function resolveStaffPortfolio(token: string): Promise<StaffPortfolio | null> {
  const db = admin();
  const primary = await linkByToken(db, token);
  if (!primary) return null;

  const primaryShop = await loadShop(db, primary);
  // 開いたリンク自体が失効していれば、束ねていても見せない（各店舗が自分のリンクを止められる）。
  if (!primaryShop) return null;

  const shops: StaffPortfolioShop[] = [primaryShop];

  const identityId = await identityOf(db, primary.id);
  if (identityId) {
    const siblingIds = (await linkIdsOfIdentity(db, identityId)).filter((id) => id !== primary.id);
    if (siblingIds.length > 0) {
      const { data: siblings } = await db
        .from("staff_portfolio_links")
        .select("id, tenant_id, staff_member_id, is_active")
        .in("id", siblingIds);
      for (const row of (siblings ?? []) as LinkRow[]) {
        // 失効した店舗は黙って落とす（束ねを壊さない・理由も出さない）。
        const shop = await loadShop(db, row);
        if (shop) shops.push(shop);
      }
    }
  }

  // 閲覧の記録は開いたリンクだけに付ける。束ねた他店の last_viewed_at を動かすと、
  // その店に「本人が別経路で見た」ことが伝わってしまう。
  await db
    .from("staff_portfolio_links")
    .update({ last_viewed_at: new Date().toISOString() })
    .eq("id", primary.id)
    .then(
      () => undefined,
      () => undefined,
    );

  return {
    staff_name: primaryShop.staff_name,
    shops,
    total_certificates: shops.reduce((n, s) => n + s.certificates.length, 0),
  };
}

export type MergeResult = { ok: true } | { ok: false; reason: "invalid" | "same" };

/**
 * 2本のリンクを同じ職人のものとして束ねる。
 *
 * **両方のトークンを持っている本人しか実行できない。**テナント側には操作も表示も無い。
 * これが「他社に稼働先が見えない」を構造で守っている部分で、同意の確認を別途要求しないで
 * 済むのも、実行できるのが本人だけだから。
 */
export async function mergeStaffPortfolios(token: string, otherToken: string): Promise<MergeResult> {
  const db = admin();
  const [a, b] = await Promise.all([linkByToken(db, token), linkByToken(db, otherToken)]);
  // 相手が失効していたら束ねない（開けないものを束ねても意味がない）。
  if (!a || !b || !(await loadShop(db, a)) || !(await loadShop(db, b))) return { ok: false, reason: "invalid" };
  if (a.id === b.id) return { ok: false, reason: "same" };

  const [idA, idB] = await Promise.all([identityOf(db, a.id), identityOf(db, b.id)]);
  if (idA && idA === idB) return { ok: true }; // 既に束ねてある

  if (!idA && !idB) {
    const { data: created, error } = await db.from("staff_portfolio_identities").insert({}).select("id").single();
    if (error || !created) throw new Error(`mergeStaffPortfolios: identity 作成に失敗 ${error?.message ?? ""}`);
    await db.from("staff_portfolio_identity_members").insert([
      { identity_id: created.id, portfolio_link_id: a.id },
      { identity_id: created.id, portfolio_link_id: b.id },
    ]);
    return { ok: true };
  }

  if (idA && !idB) {
    await db.from("staff_portfolio_identity_members").insert({ identity_id: idA, portfolio_link_id: b.id });
    return { ok: true };
  }
  if (!idA && idB) {
    await db.from("staff_portfolio_identity_members").insert({ identity_id: idB, portfolio_link_id: a.id });
    return { ok: true };
  }

  // 別々の束ねどうし: B 側を A 側へ寄せて B の identity を畳む。
  await db
    .from("staff_portfolio_identity_members")
    .update({ identity_id: idA })
    .eq("identity_id", idB as string);
  await db
    .from("staff_portfolio_identities")
    .delete()
    .eq("id", idB as string);
  return { ok: true };
}

/**
 * 束ねから1店舗を外す。自分の束ねに属するリンクしか外せない。
 *
 * 外せることが要件: 一度束ねたら戻せない仕組みは、本人にとって取り返しがつかない。
 */
export async function unlinkStaffPortfolio(token: string, dropLinkId: string): Promise<boolean> {
  const db = admin();
  const primary = await linkByToken(db, token);
  if (!primary || !(await loadShop(db, primary))) return false;
  if (primary.id === dropLinkId) return false; // 開いている本人のリンクは外せない

  const identityId = await identityOf(db, primary.id);
  if (!identityId) return false;
  const members = await linkIdsOfIdentity(db, identityId);
  if (!members.includes(dropLinkId)) return false;

  await db
    .from("staff_portfolio_identity_members")
    .delete()
    .eq("identity_id", identityId)
    .eq("portfolio_link_id", dropLinkId);

  // 1本だけ残った束ねは意味がないので畳む（行を残さない）。
  if (members.length <= 2) {
    await db.from("staff_portfolio_identity_members").delete().eq("identity_id", identityId);
    await db.from("staff_portfolio_identities").delete().eq("id", identityId);
  }
  return true;
}

/**
 * リンクを発行（または再発行）する。**raw token を返すのはこの瞬間だけ**で、
 * DB にはハッシュしか残らない。紛失したら失効させて再発行する。
 */
export async function issueStaffPortfolioLink(
  tenantId: string,
  staffMemberId: string,
  createdBy: string | null,
): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const { error } = await admin()
    .from("staff_portfolio_links")
    .upsert(
      {
        tenant_id: tenantId,
        staff_member_id: staffMemberId,
        token_hash: staffPortfolioTokenHash(token),
        is_active: true,
        created_by: createdBy,
        created_at: new Date().toISOString(),
        last_viewed_at: null,
      },
      { onConflict: "tenant_id,staff_member_id" },
    );
  if (error) throw new Error(`issueStaffPortfolioLink failed: ${error.message}`);
  return token;
}

/** リンクを失効させる。行は履歴として残し is_active だけ倒す。 */
export async function revokeStaffPortfolioLink(tenantId: string, staffMemberId: string): Promise<void> {
  const { error } = await admin()
    .from("staff_portfolio_links")
    .update({ is_active: false })
    .eq("tenant_id", tenantId)
    .eq("staff_member_id", staffMemberId);
  if (error) throw new Error(`revokeStaffPortfolioLink failed: ${error.message}`);
}
