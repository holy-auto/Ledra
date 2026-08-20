/**
 * IMP-050: レンディション・マスキング（v2.0 §18.3）。
 *
 * ADR-0003: 「マスキングは公開レンディション側で行い、
 * ハッシュ用の原本バイトは後処理しない」原則を一般化。
 *
 * 既存の certificates_public ビュー（customer_name/content_free_text を NULL 化）
 * をパターンとして型安全な pure function に昇華する。
 *
 * 純関数。IO なし。
 */

import { VISIBILITY_ORDER, type VisibilityLevel } from "./visibility";

// ── マスキング戦略 ──

export const MASKING_STRATEGIES = ["nullify", "redact", "truncate", "hash"] as const;
export type MaskingStrategy = (typeof MASKING_STRATEGIES)[number];

// ── マスキングルール ──

export interface MaskingRule {
  /** 対象フィールド名 */
  field: string;
  /** この可視性レベル未満の閲覧者に適用 */
  appliesBelow: VisibilityLevel;
  /** 適用する戦略 */
  strategy: MaskingStrategy;
  /** redact 時の置換文字列（デフォルト: "***"） */
  redactedValue?: string;
  /** truncate 時の保持文字数（デフォルト: 0） */
  keepChars?: number;
}

// ── マスキング適用 ──

/**
 * 単一の値にマスキング戦略を適用する。
 *
 * - nullify: null を返す
 * - redact: redactedValue（デフォルト "***"）を返す
 * - truncate: 先頭 keepChars 文字 + "***" を返す
 * - hash: "sha256:<hex8桁>" 形式のプレースホルダを返す
 *   （ponytail: 実際のハッシュ計算は crypto 依存になるため、
 *   呼び出し側が事前にハッシュして渡す設計。ここでは形式のみ）
 */
export function applyMask(
  value: unknown,
  strategy: MaskingStrategy,
  opts?: { redactedValue?: string; keepChars?: number },
): unknown {
  if (value == null) return null;

  switch (strategy) {
    case "nullify":
      return null;
    case "redact":
      return opts?.redactedValue ?? "***";
    case "truncate": {
      const str = String(value);
      const keep = opts?.keepChars ?? 0;
      if (keep >= str.length) return str;
      return str.slice(0, keep) + "***";
    }
    case "hash":
      // ponytail: 実際のハッシュは caller が渡す。ここではフォーマットのみ。
      return `[MASKED]`;
  }
}

// ── レンディション生成 ──

/**
 * レコードにマスキングルールを適用してレンディションを生成する。
 *
 * viewerLevel が rule.appliesBelow より低い（制限的な）場合、
 * 該当フィールドにマスキングを適用する。
 *
 * 非破壊: 新しいオブジェクトを返す（元のレコードは変更しない）。
 */
export function createRendition<T extends Record<string, unknown>>(
  original: T,
  rules: readonly MaskingRule[],
  viewerLevel: VisibilityLevel,
): T {
  const result = { ...original };
  const viewerOrder = VISIBILITY_ORDER[viewerLevel];

  for (const rule of rules) {
    const thresholdOrder = VISIBILITY_ORDER[rule.appliesBelow];
    // viewerLevel が appliesBelow より下位（数値が大きい＝特権が低い）場合にマスク適用
    if (viewerOrder > thresholdOrder && rule.field in result) {
      (result as Record<string, unknown>)[rule.field] = applyMask(result[rule.field as keyof T], rule.strategy, {
        redactedValue: rule.redactedValue,
        keepChars: rule.keepChars,
      });
    }
  }

  return result;
}

// ── 定義済みルール（certificates_public パターンの一般化） ──

/**
 * 証明書の公開レンディション用ルール。
 * certificates_public ビュー（SQL）と同じ効果を TS 側で再現。
 */
export const CERTIFICATE_PUBLIC_RULES: readonly MaskingRule[] = [
  { field: "customer_name", appliesBelow: "tenant_internal", strategy: "nullify" },
  { field: "content_free_text", appliesBelow: "tenant_internal", strategy: "nullify" },
];

/**
 * 車両レコードの公開レンディション用ルール。
 * VEHICLE_TABLE_PII_COLUMNS に対応。
 */
export const VEHICLE_PUBLIC_RULES: readonly MaskingRule[] = [
  { field: "customer_name", appliesBelow: "tenant_internal", strategy: "nullify" },
  { field: "customer_email", appliesBelow: "tenant_internal", strategy: "nullify" },
  { field: "customer_phone_masked", appliesBelow: "tenant_internal", strategy: "nullify" },
  { field: "customer_id", appliesBelow: "tenant_internal", strategy: "nullify" },
  { field: "notes", appliesBelow: "tenant_internal", strategy: "nullify" },
];

/**
 * パスポートの公開レンディション用ルール。
 * 所有者 PII はパートナー開示同意がなければマスク。
 */
export const PASSPORT_PUBLIC_RULES: readonly MaskingRule[] = [
  { field: "current_owner_name", appliesBelow: "partner_shared", strategy: "nullify" },
  { field: "current_owner_email", appliesBelow: "partner_shared", strategy: "nullify" },
];
