/**
 * 確定署名フロー（顧客本人の電話OTP所持証明＋事業者署名＋TSA）。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.4
 *
 *  requestConfirmation … 確定依頼。保証グレード/チャンネルを決定し pending 署名を作成、
 *                        OTP を発行（送信は呼び出し側/通知基盤）。
 *  verifyOtp           … 顧客が自分の携帯で OTP を入力 → otp_verified。
 *  signConfirmation    … 署名（サーバ鍵）＋TSA → part_installations を customer_verified に。
 *                        実際の遷移可否は DB の完全凍結ゲートが最終判定する。
 */

import crypto from "crypto";
import { randomUUID } from "crypto";
import { createTenantScopedAdmin, createServiceRoleAdmin } from "@/lib/supabase/admin";
import { sha256Hex } from "@/lib/customerPortalServer";
import { phoneFullHashFromRaw } from "@/lib/parts/phoneIdentity";
import { resolveConfirmation, type ContactProvenance } from "@/lib/parts/confirmationPolicy";
import { signPartConfirmation } from "@/lib/parts/partSigning";
import { requestTimestamp } from "@/lib/parts/tsa";

const OTP_TTL_MIN = Number(process.env.PARTS_OTP_TTL_MIN ?? 10);
const LINK_TTL_HOURS = Number(process.env.PARTS_CONFIRM_LINK_TTL_HOURS ?? 72);
const MAX_OTP_ATTEMPTS = 5;

function otpCodeHash(token: string, code: string): string {
  const pepper = process.env.CUSTOMER_AUTH_PEPPER;
  if (!pepper) throw new Error("Missing CUSTOMER_AUTH_PEPPER");
  return sha256Hex(`partotp|v1|${token}|${code}|${pepper}`);
}

export interface RequestConfirmationResult {
  token: string;
  channel: "line" | "sms" | "in_store_tablet";
  assurance: "customer_otp" | "store_contact_otp" | "in_store_tablet";
  expiresAt: string;
  /** 本番以外でのみ返す（テスト用）。本番では undefined。 */
  otpDevCode?: string;
}

export async function requestConfirmation(
  tenantId: string,
  installationId: string,
  opts: { inStoreTablet?: boolean } = {},
): Promise<RequestConfirmationResult> {
  const { admin } = createTenantScopedAdmin(tenantId);

  const { data: inst, error: instErr } = await admin
    .from("part_installations")
    .select("id, tenant_id, status, required_assurance, customer_id, content_hash")
    .eq("id", installationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (instErr) throw new Error(`installation load failed: ${instErr.message}`);
  if (!inst) throw new Error("installation not found");
  if (inst.status !== "installed") throw new Error(`確定依頼できる状態ではありません (status=${inst.status})`);
  if (!inst.content_hash) throw new Error("content_hash 未設定の装着は確定できません");

  // 顧客（連絡先・出所）
  let phone: string | null = null;
  let contactProvenance: ContactProvenance | null = null;
  let existingFullHash: string | null = null;
  if (inst.customer_id) {
    const { data: cust } = await admin
      .from("customers")
      .select("id, phone, phone_full_hash, contact_provenance")
      .eq("id", inst.customer_id)
      .maybeSingle();
    phone = cust?.phone ?? null;
    contactProvenance = (cust?.contact_provenance as ContactProvenance | null) ?? null;
    existingFullHash = cust?.phone_full_hash ?? null;
  }

  const phoneAvailable = !!(phone || existingFullHash);
  // LINE 連携の判定は将来の linkage 実装に委ねる（現状は SMS 既定）。
  const lineLinked = false;

  const decision = resolveConfirmation({
    requiredAssurance: inst.required_assurance,
    contactProvenance,
    lineLinked,
    phoneAvailable,
    inStoreTablet: opts.inStoreTablet,
  });
  if (!decision.ok) throw new Error(decision.reason);

  // 電話フルハッシュ（確定照合の主キー）。生番号があれば算出し、customers にも補完。
  let signerPhoneFullHash: string | null = existingFullHash;
  if (decision.channel !== "in_store_tablet") {
    if (!signerPhoneFullHash && phone) {
      signerPhoneFullHash = phoneFullHashFromRaw(tenantId, phone);
      if (inst.customer_id) {
        await admin
          .from("customers")
          .update({ phone_full_hash: signerPhoneFullHash })
          .eq("id", inst.customer_id)
          .is("phone_full_hash", null);
      }
    }
    if (!signerPhoneFullHash) throw new Error("顧客の電話番号が未登録のため確定できません");
  }

  const sigId = randomUUID();
  const token = crypto.randomBytes(24).toString("base64url");
  const now = Date.now();
  const expiresAt = new Date(now + LINK_TTL_HOURS * 3600_000).toISOString();

  // OTP（タブレット以外）
  let otpDevCode: string | undefined;
  let otpHash: string | null = null;
  let otpExpiresAt: string | null = null;
  if (decision.channel !== "in_store_tablet") {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    otpHash = otpCodeHash(token, code);
    otpExpiresAt = new Date(now + OTP_TTL_MIN * 60_000).toISOString();
    if (process.env.NODE_ENV !== "production") otpDevCode = code;
  }

  const { error: sigErr } = await admin.from("part_confirmation_signatures").insert({
    id: sigId,
    tenant_id: tenantId,
    installation_id: installationId,
    token,
    expires_at: expiresAt,
    channel: decision.channel,
    assurance: decision.assurance,
    contact_provenance: contactProvenance,
    document_hash: inst.content_hash,
    document_hash_alg: "SHA-256",
    status: decision.channel === "in_store_tablet" ? "otp_verified" : "pending",
    otp_verified_at: decision.channel === "in_store_tablet" ? new Date().toISOString() : null,
    otp_code_hash: otpHash,
    otp_expires_at: otpExpiresAt,
    signer_phone_full_hash: signerPhoneFullHash,
  });
  if (sigErr) throw new Error(`signature insert failed: ${sigErr.message}`);

  // 装着に確定署名を紐付け（status は installed のまま＝ガード許可）
  const { error: linkErr } = await admin
    .from("part_installations")
    .update({ confirmation_signature_id: sigId })
    .eq("id", installationId);
  if (linkErr) throw new Error(`link signature failed: ${linkErr.message}`);

  return { token, channel: decision.channel, assurance: decision.assurance, expiresAt, otpDevCode };
}

/**
 * 公開トークンから確定セッションのコンテキストを解決する（顧客は未認証）。
 * 既存署名フローと同様、不透明トークンを service-role で引く。
 */
export async function getConfirmationContext(token: string): Promise<{
  tenantId: string;
  installationId: string;
  status: string;
  channel: string | null;
  expiresAt: string | null;
  part: { part_name: string; quantity: number; unit: string; amount_jpy: number | null } | null;
} | null> {
  const admin = createServiceRoleAdmin("parts confirmation — 顧客は未認証。不透明トークンで tenant を解決する。");
  const { data: sig, error } = await admin
    .from("part_confirmation_signatures")
    .select("tenant_id, installation_id, status, channel, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`confirmation lookup failed: ${error.message}`);
  if (!sig) return null;

  const { data: inst } = await admin
    .from("part_installations")
    .select("part_name, quantity, unit, amount_jpy")
    .eq("id", sig.installation_id)
    .maybeSingle();

  return {
    tenantId: sig.tenant_id,
    installationId: sig.installation_id,
    status: sig.status,
    channel: sig.channel,
    expiresAt: sig.expires_at,
    part: inst
      ? { part_name: inst.part_name, quantity: inst.quantity, unit: inst.unit, amount_jpy: inst.amount_jpy }
      : null,
  };
}

export async function verifyOtp(
  tenantId: string,
  token: string,
  code: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data: sig, error } = await admin
    .from("part_confirmation_signatures")
    .select("id, status, otp_code_hash, otp_attempts, otp_expires_at")
    .eq("tenant_id", tenantId)
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`signature load failed: ${error.message}`);
  if (!sig) return { ok: false, reason: "確定リンクが無効です。" };
  if (sig.status !== "pending") return { ok: false, reason: "この確定は既に処理済みです。" };
  if (sig.otp_expires_at && new Date(sig.otp_expires_at) < new Date())
    return { ok: false, reason: "OTP の有効期限が切れています。" };
  if ((sig.otp_attempts ?? 0) >= MAX_OTP_ATTEMPTS) return { ok: false, reason: "試行回数の上限に達しました。" };

  if (!sig.otp_code_hash || otpCodeHash(token, code) !== sig.otp_code_hash) {
    await admin
      .from("part_confirmation_signatures")
      .update({ otp_attempts: (sig.otp_attempts ?? 0) + 1 })
      .eq("id", sig.id);
    return { ok: false, reason: "OTP が一致しません。" };
  }

  const { error: upErr } = await admin
    .from("part_confirmation_signatures")
    .update({
      status: "otp_verified",
      otp_verified_at: new Date().toISOString(),
      signer_ip: meta.ip ?? null,
      signer_user_agent: meta.userAgent ?? null,
    })
    .eq("id", sig.id);
  if (upErr) throw new Error(`otp verify update failed: ${upErr.message}`);
  return { ok: true };
}

export async function signConfirmation(
  tenantId: string,
  token: string,
): Promise<{ ok: true; installationId: string } | { ok: false; reason: string }> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data: sig, error } = await admin
    .from("part_confirmation_signatures")
    .select("id, status, installation_id, document_hash, signer_phone_full_hash, channel, expires_at")
    .eq("tenant_id", tenantId)
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`signature load failed: ${error.message}`);
  if (!sig) return { ok: false, reason: "確定リンクが無効です。" };
  if (sig.status !== "otp_verified") return { ok: false, reason: "本人確認(OTP)が完了していません。" };
  if (sig.expires_at && new Date(sig.expires_at) < new Date())
    return { ok: false, reason: "確定リンクの有効期限が切れています。" };
  if (!sig.signer_phone_full_hash) return { ok: false, reason: "署名者の電話情報がありません。" };

  const signedAt = new Date().toISOString();
  const signed = signPartConfirmation({
    contentHash: sig.document_hash,
    signedAt,
    installationId: sig.installation_id,
    signatureId: sig.id,
    signerPhoneFullHash: sig.signer_phone_full_hash,
  });

  // RFC3161 タイムスタンプ（未設定環境では null）
  const tsa = await requestTimestamp(sha256Hex(signed.signature));

  const { error: sigUpErr } = await admin
    .from("part_confirmation_signatures")
    .update({
      status: "signed",
      signed_at: signedAt,
      signature: signed.signature,
      signing_payload: signed.signingPayload,
      public_key_fingerprint: signed.publicKeyFingerprint,
      key_version: signed.keyVersion,
      tsa_token: tsa?.token ?? null,
      tsa_authority: tsa?.authority ?? null,
      tsa_timestamp_at: tsa?.timestampAt ?? null,
    })
    .eq("id", sig.id);
  if (sigUpErr) throw new Error(`signature finalize failed: ${sigUpErr.message}`);

  // 装着を確定（完全凍結ゲートが最終判定）
  const { error: verifyErr } = await admin
    .from("part_installations")
    .update({
      status: "customer_verified",
      customer_verified_at: signedAt,
      customer_verified_via: sig.channel,
    })
    .eq("id", sig.installation_id);
  if (verifyErr) {
    return { ok: false, reason: `確定ゲートで拒否されました: ${verifyErr.message}` };
  }

  return { ok: true, installationId: sig.installation_id };
}
