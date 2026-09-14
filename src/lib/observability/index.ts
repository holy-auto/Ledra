/**
 * 可観測性モジュール — Sentry / Healthchecks / エラー契約。
 *
 * ponytail: barrel export。既存の sentry.ts / healthchecks.ts は
 * 直接 import されているため、ここでは IMP-053 の新規追加のみ。
 */

export {
  // Types
  type DataSafetyLevel,
  type RecoveryAction,
  type ErrorCategory,
  type RetryPolicy,
  type StructuredError,
  type CreateStructuredErrorInput,
  // Factory
  createStructuredError,
  // Presets
  structuredErrors,
  // Utilities
  requiresImmediateAttention,
  toSentryContext,
  toClientPayload,
} from "./errorContract";
