/**
 * 招待フロー型・ヘルパー（IMP-012）。
 *
 * v2.0 §15 AUTH_INVITE: 招待→言語選択→OTP 入口。
 * 既存の Supabase Auth inviteUserByEmail は引き続き使うが、
 * 招待メタデータ（ロケール選択、割当先情報）を型で形式化する。
 *
 * DB テーブル `invitations` は別途マイグレーションで作成。
 * ここでは型定義と検証ロジックのみ。
 */
import type { Locale } from "@/lib/i18n/locales";
import { isSupportedLocale } from "@/lib/i18n/locales";
import type { Role } from "./roles";
import { ASSIGNABLE_ROLES } from "./roles";

// ── 招待型 ──

export const INVITE_STATUSES = ["pending", "accepted", "expired", "revoked"] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export type Invitation = {
  id: string;
  tenantId: string;
  /** 招待先メールアドレス（正規化済み） */
  email: string;
  /** 招待時に指定されたロール */
  role: Role;
  /** 招待先の割当店舗（任意） */
  storeId?: string;
  /** 招待者が選んだ／推奨するロケール */
  suggestedLocale?: Locale;
  status: InviteStatus;
  /** 招待トークン（URL に埋め込む） */
  token: string;
  /** 招待者の userId */
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
};

// ── 招待検証 ──

export type InviteValidationResult =
  | { valid: true; invitation: Invitation }
  | { valid: false; reason: "not_found" | "expired" | "already_accepted" | "revoked" };

/**
 * 招待の有効性を検証する（純粋関数）。
 * DB からの取得は呼び出し側の責任。
 */
export function validateInvitation(invitation: Invitation | null, now: string): InviteValidationResult {
  if (!invitation) return { valid: false, reason: "not_found" };
  if (invitation.status === "accepted") return { valid: false, reason: "already_accepted" };
  if (invitation.status === "revoked") return { valid: false, reason: "revoked" };
  if (new Date(invitation.expiresAt).getTime() < new Date(now).getTime()) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, invitation };
}

// ── 招待受理パラメータ ──

export type InviteAcceptParams = {
  token: string;
  /** 受理者が選んだ言語 */
  locale: Locale;
};

/**
 * 招待受理パラメータを検証する。
 * ponytail: zod は呼び出し側（API route）で使う。ここでは最小限の型チェック。
 */
export function validateAcceptParams(
  params: unknown,
): { valid: true; data: InviteAcceptParams } | { valid: false; error: string } {
  if (!params || typeof params !== "object") return { valid: false, error: "invalid_params" };
  const p = params as Record<string, unknown>;
  if (typeof p.token !== "string" || !p.token) return { valid: false, error: "missing_token" };
  if (typeof p.locale !== "string" || !isSupportedLocale(p.locale)) {
    return { valid: false, error: "invalid_locale" };
  }
  return { valid: true, data: { token: p.token, locale: p.locale as Locale } };
}

/** 招待時に割り当て可能なロールかを検証する。 */
export function isAssignableRole(role: string): role is Role {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

/** 招待の有効期限（デフォルト 7 日）を計算する。 */
export function inviteExpiresAt(ttlDays: number = 7): string {
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
}
