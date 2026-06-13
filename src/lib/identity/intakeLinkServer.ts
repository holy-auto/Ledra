/**
 * 店舗用 顧客登録リンク (reusable store registration links) — サーバ側ロジック.
 *
 * 既存の customer_intake_invitations が「1顧客=1トークン・1回限り」なのに対し、
 * このモジュールは「店舗ごとに発行する繰り返し使える固定リンク/QR」を扱う。
 *
 * フロー:
 *   1. 店舗が createStoreLink() でリンクを発行 → URL + QR を待合室等に掲示
 *   2. 顧客が /r/{short_id}?t={token} を開く
 *   3. 「登録をはじめる」で mintInvitationFromLink() を叩き、その都度
 *      customer_intake_invitations の1回限りトークンを発行
 *   4. 既存の公開フォーム /intake/{short_id} へ合流 (OCR / AI 自動承認を再利用)
 *
 * セキュリティ: token は raw 保存せず sha256(intakelink|token|pepper) のみ保存。
 */
import crypto from "crypto";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { createIntakeInvitation, type CreatedIntake } from "@/lib/identity/intakeServer";

/** mint する1回限り intake の有効期限 (日). 店頭でその場入力する想定なので短め. */
const MINTED_INTAKE_EXPIRY_DAYS = 1;

function getPepper(): string {
  const p = process.env.CUSTOMER_AUTH_PEPPER;
  if (!p) throw new Error("CUSTOMER_AUTH_PEPPER is not set");
  return p;
}

/** raw token を sha256(intakelink|token|pepper) に変換. intake 招待とは名前空間を分ける. */
export function hashLinkToken(token: string): string {
  return crypto.createHash("sha256").update(`intakelink|${token}|${getPepper()}`).digest("hex");
}

/** URL に載せる short_id (8 文字、紛らわしい文字を除外). */
function generateShortId(): string {
  const bytes = crypto.randomBytes(5);
  return [...bytes].map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 30]).join("");
}

/** raw token 本体 (URL のクエリに載せる). 32 bytes 256bit. */
function generateRawToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export interface CreatedStoreLink {
  id: string;
  shortId: string;
  rawToken: string;
  url: string;
}

export interface CreateStoreLinkInput {
  tenantId: string;
  storeId?: string | null;
  label?: string | null;
  createdBy: string;
  baseUrl: string;
}

/**
 * 店舗用の登録リンクを新規発行する. raw token は **この戻り値以外には現れない**.
 */
export async function createStoreLink(input: CreateStoreLinkInput): Promise<CreatedStoreLink> {
  const rawToken = generateRawToken();
  const tokenHash = hashLinkToken(rawToken);
  const { admin } = createTenantScopedAdmin(input.tenantId);

  for (let i = 0; i < 3; i++) {
    const shortId = generateShortId();
    const { data, error } = await admin
      .from("customer_intake_links")
      .insert({
        tenant_id: input.tenantId,
        store_id: input.storeId ?? null,
        token_hash: tokenHash,
        token_plain: rawToken,
        short_id: shortId,
        label: input.label ?? null,
        created_by: input.createdBy,
      })
      .select("id, short_id")
      .single();

    if (error) {
      if (error.code === "23505" && error.message.includes("short_id")) continue;
      throw error;
    }
    if (!data) throw new Error("Failed to create store link");

    return {
      id: data.id,
      shortId: data.short_id,
      rawToken,
      url: `${input.baseUrl}/r/${data.short_id}?t=${rawToken}`,
    };
  }
  throw new Error("Failed to allocate short_id after retries");
}

export interface ValidatedStoreLink {
  id: string;
  tenantId: string;
  storeId: string | null;
  storeName: string | null;
  label: string | null;
  isActive: boolean;
}

/**
 * 公開フローで URL から渡された short_id + raw token を検証する.
 * 検証成功時のみ ValidatedStoreLink を返す. 失敗・無効化時は null.
 */
export async function validateStoreLink(shortId: string, rawToken: string): Promise<ValidatedStoreLink | null> {
  if (!shortId || !rawToken) return null;
  if (!/^[a-z0-9]{8}$/.test(shortId)) return null;

  // tenantId 不明の段階なので service-role admin を使う。token_hash 完全一致を
  // WHERE 句で要求するため、他テナント行を誤って触ることはない。
  const { createServiceRoleAdmin } = await import("@/lib/supabase/admin");
  const sb = createServiceRoleAdmin("public store-link lookup: validate raw token before disclosing tenant_id");

  const tokenHash = hashLinkToken(rawToken);
  const { data } = await sb
    .from("customer_intake_links")
    .select("id, tenant_id, store_id, label, is_active, stores(name)")
    .eq("short_id", shortId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!data) return null;

  const store = data.stores as { name: string | null } | { name: string | null }[] | null;
  const storeName = Array.isArray(store) ? (store[0]?.name ?? null) : (store?.name ?? null);

  return {
    id: data.id,
    tenantId: data.tenant_id,
    storeId: data.store_id,
    storeName,
    label: data.label,
    isActive: data.is_active,
  };
}

/**
 * 検証済みリンクから、その都度 1 回限りの intake 招待を発行する.
 * 既存の createIntakeInvitation を再利用し、store_id を引き継ぐ.
 */
export async function mintInvitationFromLink(link: ValidatedStoreLink, baseUrl: string): Promise<CreatedIntake> {
  const today = new Date().toLocaleDateString("ja-JP");
  const storePart = link.storeName ? `${link.storeName} ` : "";
  const minted = await createIntakeInvitation({
    tenantId: link.tenantId,
    storeId: link.storeId,
    label: `${storePart}Web登録 (${today})`,
    expiryDays: MINTED_INTAKE_EXPIRY_DAYS,
    createdBy: null,
    baseUrl,
  });

  // best-effort: 利用カウンタと最終利用日時を更新 (失敗しても mint は成功扱い)
  try {
    const { createServiceRoleAdmin } = await import("@/lib/supabase/admin");
    const sb = createServiceRoleAdmin("public store-link flow: bump submission counter");
    await sb.rpc("increment_intake_link_usage", { p_id: link.id });
  } catch {
    // ignore
  }

  return minted;
}

export interface StoreLinkRow {
  id: string;
  short_id: string;
  store_id: string | null;
  store_name: string | null;
  label: string | null;
  is_active: boolean;
  submission_count: number;
  created_at: string;
  last_used_at: string | null;
  /** 再表示用の完全な URL. raw token を保持しているため任意のタイミングで再生成できる. */
  url: string;
}

/** tenant の登録リンク一覧を返す. url は baseUrl から再構成する. */
export async function listStoreLinks(tenantId: string, baseUrl: string): Promise<StoreLinkRow[]> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data, error } = await admin
    .from("customer_intake_links")
    .select(
      "id, short_id, store_id, label, is_active, submission_count, created_at, last_used_at, token_plain, stores(name)",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((r) => {
    const store = r.stores as { name: string | null } | { name: string | null }[] | null;
    const storeName = Array.isArray(store) ? (store[0]?.name ?? null) : (store?.name ?? null);
    return {
      id: r.id,
      short_id: r.short_id,
      store_id: r.store_id,
      store_name: storeName,
      label: r.label,
      is_active: r.is_active,
      submission_count: r.submission_count,
      created_at: r.created_at,
      last_used_at: r.last_used_at,
      url: `${baseUrl}/r/${r.short_id}?t=${r.token_plain}`,
    };
  });
}

/** リンクを無効化 (is_active=false). 履歴は残す. */
export async function deactivateStoreLink(tenantId: string, id: string): Promise<void> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { error } = await admin
    .from("customer_intake_links")
    .update({ is_active: false })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw error;
}
