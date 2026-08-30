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

/**
 * 可視性の厳密さ順序（0 = 最も制限的）。
 *
 * この数値順序は tenant_internal → partner_shared → public の3レベルにのみ
 * 「特権のネスト」（数値が小さいほど広く見える）として適用される。owner_only
 * はこの階層に含まれない独立した軸で、`canAccess()` が別扱いする
 * （「データ主体本人である」ことは tenant_internal 以上の特権を意味しない）。
 */
export const VISIBILITY_ORDER: Record<VisibilityLevel, number> = {
  owner_only: 0,
  tenant_internal: 1,
  partner_shared: 2,
  public: 3,
};

/**
 * a が b より制限的か。
 *
 * owner_only は独立した軸のため tenant_internal/partner_shared/public とは
 * 順序比較できない——「より制限的」とも「より緩い」とも言えない、非順序関係
 * （canAccess() 参照）。どちらか一方だけが owner_only の場合は false を返す
 * （数値比較をそのまま使うと、呼び出し側が「2つのルールのうち厳しい方」を
 * 選ぶ目的でこの関数を使った際に、owner_only を階層に巻き戻してしまう
 * ——Codex レビュー指摘）。owner_only 同士、または tenant_internal/
 * partner_shared/public 同士の比較にのみ意味のある結果を返す。
 */
export function isMoreRestrictive(a: VisibilityLevel, b: VisibilityLevel): boolean {
  if (a === "owner_only" || b === "owner_only") return false;
  return VISIBILITY_ORDER[a] < VISIBILITY_ORDER[b];
}

/**
 * requiredLevel 以上の閲覧権を actualLevel が持っているか。
 *
 * tenant_internal → partner_shared → public はネストした「特権の強さ」の階層
 * （order が小さいほど広く閲覧可）。owner_only はこの階層に含まれない独立した軸
 * — 「データ主体本人である」ことは、階層上位の tenant_internal/partner_shared を
 * 自動的に満たさない。含めてしまうと、顧客が自分のPIIを閲覧できるという理由だけで
 * 他人のテナント内部データや restricted な認証情報にまでアクセスできてしまう
 * （Codex レビュー指摘、P1: 顧客は自分のデータの「所有者」であって、
 * テナントスタッフより「上位の特権者」ではない）。
 *
 * 例: required = "tenant_internal", actual = "owner_only" → false（本人以外の
 *      階層には自動昇格しない。本人向けフィールドは requiredLevel="owner_only" 側で判定）
 *      required = "public", actual = "owner_only" → true（public は誰でも閲覧可）
 *      required = "owner_only", actual = "owner_only" → true（本人向けフィールドは本人のみ）
 *      required = "tenant_internal", actual = "public" → false（下位は閲覧不可、既存どおり）
 */
export function canAccess(requiredLevel: VisibilityLevel, actualLevel: VisibilityLevel): boolean {
  if (requiredLevel === "public") return true;
  if (requiredLevel === "owner_only") return actualLevel === "owner_only";
  if (actualLevel === "owner_only") return false; // 本人であることは tenant_internal/partner_shared を満たさない
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
 * 1. データ主体本人 → owner_only（本人向けフィールドのみ閲覧可。tenant_internal
 *    以上の階層へは自動昇格しない — canAccess() 参照）
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
 * restricted → owner_only（canAccess() 上は「厳密一致のみ」だが、restricted
 *   分類自体が本人の概念を持たないテーブル——auth.users/tenants/
 *   square_connections の暗号化カラム——に付くため、実運用ではこの経路
 *   自体を通さず findClassificationViolations() でレンダリング前に弾く
 *   のが正しい防御。この owner_only 指定は迂回された場合の保険であり、
 *   唯一の防御ではない）
 * pii/confidential → tenant_internal（テナントスタッフは通常業務で閲覧可能）
 * public → 制限なし
 *
 * ponytail（既知の限界）: このマッピングは「第三者・テナントスタッフから
 * 見た最低要件」を表し、「データ主体本人が自分自身のレコードを見る」ケースは
 * カバーしない——本人であっても pii/confidential 要求のフィールドは
 * canAccess() 上 tenant_internal を満たさないため、findHiddenFields()/
 * createRendition() をこのマッピングのまま本人向けにも適用すると、
 * 本人自身のデータまで隠れる。これは owner_only を tenant_internal 以上に
 * 自動昇格させると restricted への迂回経路が復活するため（Codex レビュー
 * で往復して確認済みのトレードオフ）、意図的に残した制約。
 * 「本人は自分のレコードを見られるようにしたい」呼び出し側は、
 * viewer.isDataSubject と「このレコードが本人のものか」を個別に判定し、
 * 真であれば findHiddenFields()/createRendition() を経由せず生データを返す
 * 判断を呼び出し側自身で行う必要がある。
 * 個別エンティティが上書きする場合は FieldVisibilityRule で指定。
 */
export const DEFAULT_REQUIRED_VISIBILITY: Record<DataClassification, VisibilityLevel> = {
  restricted: "owner_only",
  pii: "tenant_internal",
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
