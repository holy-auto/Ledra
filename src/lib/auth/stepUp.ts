/**
 * Step-up 認証（IMP-012）。
 *
 * 重要操作に追加認証を要求するための型とヘルパー。
 * 既存の WebAuthn 操作署名（webauthn/gate.ts）と TOTP MFA（mfa.ts）を
 * 統一的に扱う抽象層。
 *
 * v2.0 §15: 重要操作（証明書発行・void・決済承認・権限変更）は
 * step-up 認証が必要。WebAuthn が登録済みなら biometric、
 * 未登録なら TOTP または OTP 再検証を要求する。
 */
import type { Role } from "./roles";
import type { DeviceTrustLevel } from "./devices";

// ── Step-up 手段 ──

export const STEP_UP_METHODS = ["webauthn", "totp", "otp_reverify"] as const;
export type StepUpMethod = (typeof STEP_UP_METHODS)[number];

// ── Step-up 要件 ──

/**
 * 操作カテゴリと step-up 要件のマッピング。
 * ponytail: 静的マップ。ランタイムルールエンジンは IMP-013 の責任。
 */
export const STEP_UP_OPERATIONS = [
  "certificate_finalize",
  "certificate_void",
  "certificate_correction",
  "payment_approve",
  "role_change",
  "device_revoke",
  "data_export",
] as const;

export type StepUpOperation = (typeof STEP_UP_OPERATIONS)[number];

export type StepUpRequirement = {
  operation: StepUpOperation;
  /** この操作に step-up が必要な最低ロール（これ以上は全員必要） */
  requiredAboveRole?: Role;
  /** 信頼済み端末なら step-up をスキップできるか */
  trustBypassAllowed: boolean;
};

/**
 * デフォルトの step-up 要件マップ。
 * ponytail: これだけで v2.0 §15 のコア要件を満たす。
 * 運用で上書きしたい場合は DB テーブル化する（IMP-013 以降の判断）。
 */
export const DEFAULT_STEP_UP_REQUIREMENTS: StepUpRequirement[] = [
  { operation: "certificate_finalize", trustBypassAllowed: false },
  { operation: "certificate_void", trustBypassAllowed: false },
  { operation: "certificate_correction", trustBypassAllowed: false },
  { operation: "payment_approve", trustBypassAllowed: false },
  { operation: "role_change", trustBypassAllowed: false },
  { operation: "device_revoke", trustBypassAllowed: true },
  { operation: "data_export", trustBypassAllowed: true },
];

/**
 * 操作に step-up が必要かを判定する。
 */
export function requiresStepUp(
  operation: StepUpOperation,
  deviceTrust: DeviceTrustLevel,
  requirements: StepUpRequirement[] = DEFAULT_STEP_UP_REQUIREMENTS,
): boolean {
  const req = requirements.find((r) => r.operation === operation);
  if (!req) return false;
  if (req.trustBypassAllowed && deviceTrust === "trusted") return false;
  return true;
}

/**
 * 利用可能な step-up 手段を返す。
 * 優先順位: webauthn > totp > otp_reverify
 */
export function availableStepUpMethods(opts: {
  hasPasskey: boolean;
  hasTotp: boolean;
  hasVerifiedEmail: boolean;
}): StepUpMethod[] {
  const methods: StepUpMethod[] = [];
  if (opts.hasPasskey) methods.push("webauthn");
  if (opts.hasTotp) methods.push("totp");
  if (opts.hasVerifiedEmail) methods.push("otp_reverify");
  return methods;
}
