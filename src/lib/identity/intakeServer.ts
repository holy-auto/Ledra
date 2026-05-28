/**
 * 顧客事前カルテ (customer intake) — サーバ側ロジック.
 *
 * 店舗が「お客様にこの URL/QR を渡してください」を 1 クリックで作れて、
 * 顧客は OTP 等なしで URL から直接フォーム入力できる. OCR (身分証自動入力)
 * もこのトークン経由で叩ける.
 *
 * セキュリティ:
 * - token は raw のまま DB に保存しない. sha256(token || pepper) のみ保存.
 * - URL 上には short_id を載せ、検証のために body/header で raw token を送らせる
 *   実装にするとシンプルだが、UX を優先して URL に raw token を入れる構造にする.
 *   その代わり: 有効期限・1 回限り・OCR 回数上限の 3 重防御で漏洩時の影響を限定.
 * - 公開フローなので IP rate limit が必須 (route 側で適用).
 */
import crypto from "crypto";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

const DEFAULT_EXPIRY_DAYS = 7;
const MAX_EXPIRY_DAYS = 30;

function getPepper(): string {
  const p = process.env.CUSTOMER_AUTH_PEPPER;
  if (!p) throw new Error("CUSTOMER_AUTH_PEPPER is not set");
  return p;
}

/** raw token を sha256(token || pepper) に変換. */
export function hashIntakeToken(token: string): string {
  return crypto.createHash("sha256").update(`intake|${token}|${getPepper()}`).digest("hex");
}

/** URL に載せる short_id (8 文字、英小文字+数字). */
function generateShortId(): string {
  // base32-ish (避ける文字なし) で 8 桁. 約 40bit のエントロピー.
  const bytes = crypto.randomBytes(5);
  return [...bytes].map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 30]).join("");
}

/** raw token 本体 (URL のクエリ or path に載せる). 32 bytes 256bit. */
function generateRawToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export interface CreatedIntake {
  id: string;
  shortId: string;
  rawToken: string;
  url: string;
  expiresAt: string;
}

export interface CreateIntakeInput {
  tenantId: string;
  storeId?: string | null;
  label?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  expiryDays?: number;
  /** auth.users.id. 公開予約フローなど認証ユーザがいない経路では null を渡す. */
  createdBy: string | null;
  baseUrl: string;
}

/**
 * 招待を新規発行する. raw token は **この戻り値以外には現れない**.
 * 呼び出し側で URL を生成して顧客に共有する.
 */
export async function createIntakeInvitation(input: CreateIntakeInput): Promise<CreatedIntake> {
  const expiryDays = Math.min(Math.max(input.expiryDays ?? DEFAULT_EXPIRY_DAYS, 1), MAX_EXPIRY_DAYS);
  const rawToken = generateRawToken();
  const tokenHash = hashIntakeToken(rawToken);

  const { admin } = createTenantScopedAdmin(input.tenantId);

  // short_id の衝突は理論上極めて低いが、最大 3 回までリトライ
  for (let i = 0; i < 3; i++) {
    const shortId = generateShortId();
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 3600 * 1000);
    const { data, error } = await admin
      .from("customer_intake_invitations")
      .insert({
        tenant_id: input.tenantId,
        store_id: input.storeId ?? null,
        token_hash: tokenHash,
        short_id: shortId,
        label: input.label ?? null,
        contact_email: input.contactEmail ?? null,
        contact_phone: input.contactPhone ?? null,
        created_by: input.createdBy ?? null,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, short_id, expires_at")
      .single();

    if (error) {
      // unique violation (short_id 衝突) はリトライ. 他はそのまま
      if (error.code === "23505" && error.message.includes("short_id")) continue;
      throw error;
    }
    if (!data) throw new Error("Failed to create intake invitation");

    const url = `${input.baseUrl}/intake/${data.short_id}?t=${rawToken}`;
    return {
      id: data.id,
      shortId: data.short_id,
      rawToken,
      url,
      expiresAt: data.expires_at,
    };
  }
  throw new Error("Failed to allocate short_id after retries");
}

export interface ValidatedIntake {
  id: string;
  tenantId: string;
  storeId: string | null;
  label: string | null;
  status: "pending" | "completed" | "revoked" | "expired";
  expiresAt: string;
  ocrAttempts: number;
}

/**
 * 公開フローで URL から渡された short_id + raw token を検証する.
 * 検証成功時のみ ValidatedIntake を返す. 失敗時は null.
 *
 * 注意: 期限切れは自動的に status='expired' に更新する (lazy).
 */
export async function validateIntakeToken(shortId: string, rawToken: string): Promise<ValidatedIntake | null> {
  if (!shortId || !rawToken) return null;
  if (!/^[a-z0-9]{8}$/.test(shortId)) return null;

  // tenantId が分からない段階なので service-role admin を直接使う必要がある.
  // ただし WHERE 句で token_hash 完全一致を要求するため、誤って他テナントの行を
  // 触ることはない.
  const { createServiceRoleAdmin } = await import("@/lib/supabase/admin");
  const sb = createServiceRoleAdmin("public intake token lookup: validate raw token before disclosing tenant_id");

  const tokenHash = hashIntakeToken(rawToken);
  const { data } = await sb
    .from("customer_intake_invitations")
    .select("id, tenant_id, store_id, label, status, expires_at, ocr_attempts")
    .eq("short_id", shortId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!data) return null;

  const status = data.status as ValidatedIntake["status"];
  const expired = new Date(data.expires_at).getTime() < Date.now();

  if (expired && status === "pending") {
    // lazy expire
    await sb
      .from("customer_intake_invitations")
      .update({ status: "expired" })
      .eq("id", data.id)
      .eq("status", "pending");
    return {
      id: data.id,
      tenantId: data.tenant_id,
      storeId: data.store_id,
      label: data.label,
      status: "expired",
      expiresAt: data.expires_at,
      ocrAttempts: data.ocr_attempts ?? 0,
    };
  }

  return {
    id: data.id,
    tenantId: data.tenant_id,
    storeId: data.store_id,
    label: data.label,
    status,
    expiresAt: data.expires_at,
    ocrAttempts: data.ocr_attempts ?? 0,
  };
}

/** OCR 使用カウンタをアトミックにインクリメント. CHECK 違反で false. */
export async function incrementOcrAttempts(intakeId: string): Promise<boolean> {
  const { createServiceRoleAdmin } = await import("@/lib/supabase/admin");
  const sb = createServiceRoleAdmin("public intake flow: token-gated tenant write");
  const { error } = await sb.rpc("increment_intake_ocr_attempts", { p_id: intakeId }).single();
  if (error) {
    // RPC が無い環境では、SELECT + UPDATE で fallback
    const { data } = await sb
      .from("customer_intake_invitations")
      .select("ocr_attempts")
      .eq("id", intakeId)
      .maybeSingle();
    if (!data) return false;
    const next = (data.ocr_attempts ?? 0) + 1;
    if (next > 10) return false;
    const { error: upErr } = await sb
      .from("customer_intake_invitations")
      .update({ ocr_attempts: next })
      .eq("id", intakeId);
    return !upErr;
  }
  return true;
}

export interface IntakeSubmitInput {
  intakeId: string;
  tenantId: string;
  storeId: string | null;
  name: string;
  nameKana?: string | null;
  email?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  address?: string | null;
  birthDate?: string | null;
  note?: string | null;
}

export async function submitIntake(input: IntakeSubmitInput): Promise<{ customerId: string }> {
  const { createServiceRoleAdmin } = await import("@/lib/supabase/admin");
  const sb = createServiceRoleAdmin("public intake flow: token-gated tenant write");

  // customers を作成
  const { data: customer, error: cErr } = await sb
    .from("customers")
    .insert({
      tenant_id: input.tenantId,
      name: input.name,
      name_kana: input.nameKana ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      postal_code: input.postalCode ?? null,
      address: input.address ?? null,
      birth_date: input.birthDate ?? null,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (cErr || !customer) throw cErr ?? new Error("Failed to create customer");

  // intake を completed にする
  const { error: uErr } = await sb
    .from("customer_intake_invitations")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_customer_id: customer.id,
    })
    .eq("id", input.intakeId)
    .eq("status", "pending");
  if (uErr) throw uErr;

  return { customerId: customer.id };
}
