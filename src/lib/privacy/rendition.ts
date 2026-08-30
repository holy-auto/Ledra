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

import { canAccess, type VisibilityLevel } from "./visibility";
import { VEHICLE_TABLE_PII_COLUMNS, PASSPORT_TABLE_PII_COLUMNS } from "@/lib/vehicles/customerRelation";

// ── マスキング戦略 ──

export const MASKING_STRATEGIES = ["nullify", "redact", "truncate", "hash"] as const;
export type MaskingStrategy = (typeof MASKING_STRATEGIES)[number];

// ── マスキングルール ──

export interface MaskingRule {
  /** 対象フィールド名 */
  readonly field: string;
  /** この可視性レベル未満の閲覧者に適用 */
  readonly appliesBelow: VisibilityLevel;
  /** 適用する戦略 */
  readonly strategy: MaskingStrategy;
  /** redact 時の置換文字列（デフォルト: "***"） */
  readonly redactedValue?: string;
  /** truncate 時の保持文字数（デフォルト: 0） */
  readonly keepChars?: number;
}

// ── マスキング適用 ──

/**
 * 単一の値にマスキング戦略を適用する。
 *
 * - nullify: null を返す
 * - redact: redactedValue（デフォルト "***"）を返す
 * - truncate: 先頭 min(keepChars, 文字列長/2) 文字 + "***" を返す
 *   （短い値でも常に半分以下しか残さない。全文字露出を防ぐ）
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
      // 負値は String.slice が末尾からのオフセットとして解釈し、
      // ほぼ全文字を残してしまう（例: keepChars: -1 で末尾1文字以外が露出）。
      // 0 未満は 0 にクランプする。
      const requested = Math.max(0, opts?.keepChars ?? 0);
      // keepChars が値の長さ以上だと、以前は無条件マスクなしで値をそのまま
      // 返していた——短い機密値（PIN 等）が keepChars の設定次第で全文字
      // 露出しうる（Codex レビュー指摘）。常に半分以下しか残さないことで、
      // どんな短い値でも最低限マスクがかかることを保証する。
      const keep = Math.min(requested, Math.floor(str.length / 2));
      return str.slice(0, keep) + "***";
    }
    case "hash":
      // ponytail: 実際のハッシュ計算は行わない。value は呼び出し側が
      // 事前にハッシュ済みの値を渡す前提で、フォーマットのみ整形する。
      return `sha256:${String(value).slice(0, 8)}`;
  }
}

// ── レンディション生成 ──

/**
 * レコードにマスキングルールを適用してレンディションを生成する。
 *
 * viewerLevel が rule.appliesBelow の閲覧権を持たない場合（`canAccess()` が
 * false を返す場合）、該当フィールドにマスキングを適用する。owner_only な
 * 閲覧者は「本人向けフィールド」以外は tenant_internal/partner_shared 要求の
 * フィールドを自動的には見られない（visibility.ts の canAccess() 参照）。
 *
 * 非破壊: 新しいオブジェクトを返す（元のレコードは変更しない）。
 *
 * 戻り値の型: マスク適用フィールドは null または string になりうるため、
 * `T` をそのまま返すと呼び出し側が元の型（例: string）のメソッドを呼んで
 * 実行時に落ちる。全フィールドを `T[K] | string | null` に広げて反映する。
 */
export type Redacted<T> = { [K in keyof T]: T[K] | string | null };

export function createRendition<T extends Record<string, unknown>>(
  original: T,
  rules: readonly MaskingRule[],
  viewerLevel: VisibilityLevel,
): Redacted<T> {
  const result = { ...original };

  for (const rule of rules) {
    // canAccess() を単一の判定源として使う（以前はここで VISIBILITY_ORDER を
    // 直接比較する独自ロジックを持っており、visibility.ts 側で canAccess() の
    // 意味論を変更した際に追随できず、owner_only 閲覧者に対して一切マスクが
    // かからなくなっていた——同じ判定を2箇所に実装すると、片方だけ直しても
    // もう片方が古い意味論のまま残るバグの典型例）。
    if (!canAccess(rule.appliesBelow, viewerLevel) && rule.field in result) {
      (result as Record<string, unknown>)[rule.field] = applyMask(result[rule.field as keyof T], rule.strategy, {
        redactedValue: rule.redactedValue,
        keepChars: rule.keepChars,
      });
    }
  }

  return result as Redacted<T>;
}

// ── 定義済みルール（certificates_public パターンの一般化） ──

/**
 * ルール配列を実行時に凍結する。`readonly MaskingRule[]` は型上の防御でしかなく、
 * `RULES[0].appliesBelow = "public"` のようなプロパティ代入は防げない
 * （コンパイラを迂回する呼び出し元がいれば、プロセス内で共有ポリシーが
 * グローバルに書き換わってしまう）。各要素と配列自体を Object.freeze する。
 */
function frozenRules(rules: readonly MaskingRule[]): readonly MaskingRule[] {
  for (const r of rules) Object.freeze(r);
  return Object.freeze(rules);
}

/**
 * 証明書の公開レンディション用ルール。
 * certificates_public ビュー（SQL）と同じ効果を TS 側で再現。
 */
export const CERTIFICATE_PUBLIC_RULES: readonly MaskingRule[] = frozenRules([
  { field: "customer_name", appliesBelow: "tenant_internal", strategy: "nullify" },
  { field: "content_free_text", appliesBelow: "tenant_internal", strategy: "nullify" },
  // vehicle_info_json は { maker, model, plate } を含む（create.ts）。
  // certificateVersion.ts が PII と明示している既存フィールドで、
  // certificates_public ビュー自身の2フィールドのみのマスキングが
  // 元々不完全だったことの回帰防止（Codex レビュー指摘）。
  { field: "vehicle_info_json", appliesBelow: "tenant_internal", strategy: "nullify" },
]);

/**
 * 車両レコードの公開レンディション用ルール。
 * VEHICLE_TABLE_PII_COLUMNS（customerRelation.ts の単一定義源）から生成。
 * 手書きの固定リストにすると、テーブル側でカラムが増減しても追随せず
 * 乖離する（実際に customer_name/customer_email/customer_phone_masked は
 * 既にテーブルから削除済みで、残っている plate_display が抜けていた）。
 */
export const VEHICLE_PUBLIC_RULES: readonly MaskingRule[] = frozenRules(
  VEHICLE_TABLE_PII_COLUMNS.map((field) => ({
    field,
    appliesBelow: "tenant_internal",
    strategy: "nullify",
  })),
);

/**
 * パスポートの公開レンディション用ルール。
 * PASSPORT_TABLE_PII_COLUMNS（customerRelation.ts の単一定義源）から生成。
 * 現所有者・前所有者いずれの PII もパートナー開示同意がなければマスク
 * （前所有者の PII を新所有者に見せない、という passport_ownership_transfers
 * の設計意図を含む）。to_owner_email/to_owner_name/message は受領者本人に
 * 見せる意図的な公開データのため対象外（piiFields.ts の PublicTransferView 検証と一致）。
 */
export const PASSPORT_PUBLIC_RULES: readonly MaskingRule[] = frozenRules(
  PASSPORT_TABLE_PII_COLUMNS.map((field) => ({
    field,
    appliesBelow: "partner_shared",
    strategy: "nullify",
  })),
);
