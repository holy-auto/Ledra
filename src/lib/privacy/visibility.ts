/**
 * IMP-050: 4 段階可視性モデル（v2.0 §18）。
 *
 * データの閲覧範囲を 4 レベルで制御する型と判定関数。
 * 既存の is_pii_disclosed（保険会社 PII 開示同意）を
 * partner_shared レベルとして一般化する。
 *
 * - owner_only: データ主体本人（顧客）のみ
 * - tenant_internal: テナント内スタッフ以上
 * - partner_shared: パートナー（保険会社等）に開示同意済み
 * - public: 誰でも閲覧可（PII リダクト済み）
 *
 * 純関数。IO なし。
 */

import type { DataClassification } from "./classification";

// ── 可視性レベル ──

export const VISIBILITY_LEVELS = ["owner_only", "tenant_internal", "partner_shared", "public"] as const;
export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number];

/** 可視性の厳密さ順序（0 = 最も制限的） */
const VISIBILITY_ORDER: Record<VisibilityLevel, number> = {
  owner_only: 0,
  tenant_internal: 1,
  partner_shared: 2,
  public: 3,
};

/** a が b より制限的か */
export function isMoreRestrictive(a: VisibilityLevel, b: VisibilityLevel): boolean {
  return VISIBILITY_ORDER[a] < VISIBILITY_ORDER[b];
}

/**
 * requiredLevel 以上の閲覧権を actualLevel が持っているか。
 * order が小さいほど特権が高い（owner_only=0 が最上位）。
 * 例: required = "tenant_internal", actual = "owner_only" → true（上位は閲覧可）
 *      required = "tenant_internal", actual = "public" → false（下位は閲覧不可）
 */
export function canAccess(requiredLevel: VisibilityLevel, actualLevel: VisibilityLevel): boolean {
  return VISIBILITY_ORDER[actualLevel] <= VISIBILITY_ORDER[requiredLevel];
}

// ── 閲覧者コンテキスト ──

export type ViewerRole = "owner" | "staff" | "partner" | "public";

export interface ViewerContext {
  /** 閲覧者のロール */
  role: ViewerRole;
  /** データ主体と同一人物か */
  isDataSubject: boolean;
  /** パートナー開示同意済みか（保険会社 PII 開示等） */
  hasPartnerConsent: boolean;
}

/**
 * 閲覧者コンテキストから有効な可視性レベルを解決する。
 *
 * 判定順:
 * 1. データ主体本人 → owner_only（全レベルアクセス可）
 * 2. テナントスタッフ以上 → tenant_internal
 * 3. パートナーで開示同意あり → partner_shared
 * 4. それ以外 → public
 */
export function resolveVisibility(viewer: ViewerContext): VisibilityLevel {
  if (viewer.isDataSubject) return "owner_only";
  if (viewer.role === "owner" || viewer.role === "staff") return "tenant_internal";
  if (viewer.role === "partner" && viewer.hasPartnerConsent) return "partner_shared";
  return "public";
}

// ── 分類→可視性の最低要件マッピング ──

/**
 * データ分類ごとに要求される最低可視性レベル。
 *
 * restricted/pii → owner_only 以上でないと閲覧不可
 * confidential → tenant_internal 以上
 * public → 制限なし
 *
 * ponytail: このマッピングはデフォルト方針。個別エンティティが
 * 上書きする場合は FieldVisibilityRule で指定。
 */
export const DEFAULT_REQUIRED_VISIBILITY: Record<DataClassification, VisibilityLevel> = {
  restricted: "owner_only",
  pii: "owner_only",
  confidential: "tenant_internal",
  public: "public",
};

// ── フィールド別可視性ルール ──

export interface FieldVisibilityRule {
  field: string;
  /** このフィールドに必要な最低可視性 */
  requiredLevel: VisibilityLevel;
}

/**
 * フィールド群から、閲覧者が見られないフィールドを識別する。
 * 返り値: 除外すべきフィールド名の配列（空 = 全フィールド閲覧可）。
 */
export function findHiddenFields(rules: readonly FieldVisibilityRule[], viewerLevel: VisibilityLevel): string[] {
  return rules.filter((r) => !canAccess(r.requiredLevel, viewerLevel)).map((r) => r.field);
}
