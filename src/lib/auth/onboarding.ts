/**
 * v2.0 §15 正準オンボーディングフロー状態機械（IMP-012）。
 *
 * 正準フロー: INVITED → LANGUAGE_SET → OTP_VERIFIED → STORE_ASSIGNED → BIOMETRIC_ENROLLED → ACTIVE
 *
 * 既存の Supabase Auth + password ログインは引き続き稼働する。
 * この状態機械は「新規招待→初期セットアップ」の型付きワークフローを定義し、
 * 各段階で何が完了しているかを追跡する。DB マイグレーションは別途。
 */
import type { Locale } from "@/lib/i18n/locales";
import type { Role } from "./roles";

// ── Onboarding Steps ──

export const ONBOARDING_STEPS = [
  "INVITED",
  "LANGUAGE_SET",
  "OTP_VERIFIED",
  "STORE_ASSIGNED",
  "BIOMETRIC_ENROLLED",
  "ACTIVE",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const STEP_INDEX: Record<OnboardingStep, number> = Object.fromEntries(ONBOARDING_STEPS.map((s, i) => [s, i])) as Record<
  OnboardingStep,
  number
>;

/** このステップの次を返す。ACTIVE なら null（完了済み）。 */
export function nextStep(current: OnboardingStep): OnboardingStep | null {
  const i = STEP_INDEX[current];
  return ONBOARDING_STEPS[i + 1] ?? null;
}

/** from → to の遷移が正当かを検証する（前進のみ許可）。 */
export function isValidTransition(from: OnboardingStep, to: OnboardingStep): boolean {
  return STEP_INDEX[to] === STEP_INDEX[from] + 1;
}

/** 指定ステップ以上に到達済みかを判定する。 */
export function hasReached(current: OnboardingStep, target: OnboardingStep): boolean {
  return STEP_INDEX[current] >= STEP_INDEX[target];
}

/** オンボーディング完了かを判定する。 */
export function isOnboardingComplete(step: OnboardingStep): boolean {
  return step === "ACTIVE";
}

// ── Onboarding Session ──

export type OnboardingSession = {
  userId: string;
  currentStep: OnboardingStep;
  /** 招待トークン（検証済みなら残す、未使用の新規招待を追跡） */
  inviteToken?: string;
  /** 言語選択で選んだロケール */
  locale?: Locale;
  /** OTP 検証済みのメールアドレス */
  verifiedEmail?: string;
  /** 割り当て先店舗 ID */
  storeId?: string;
  /** 割り当てロール */
  role?: Role;
  /** 生体登録済みの認証器 credential ID */
  credentialId?: string;
  /** セッション開始時刻（ISO 8601） */
  startedAt: string;
  /** 最終更新時刻（ISO 8601） */
  updatedAt: string;
};

/**
 * ステップを進める。遷移が不正なら null を返す。
 * ponytail: 純粋関数。副作用（DB 更新）は呼び出し側の責任。
 */
export function advanceStep(session: OnboardingSession, to: OnboardingStep, now: string): OnboardingSession | null {
  if (!isValidTransition(session.currentStep, to)) return null;
  return { ...session, currentStep: to, updatedAt: now };
}
