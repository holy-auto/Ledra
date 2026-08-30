/**
 * IMP-026: 顧客懸念(Customer Concern)型定義
 *
 * 確認フロー(受領サイン・部品確認・板金同意・進捗追跡)から顧客が
 * 「気になる点」を提起するための型。customer_inquiries(一般問い合わせ)とは別系統。
 *
 * ponytail: 型と最小ヘルパーのみ。admin UI は既存の問い合わせ画面パターンに倣い最小限。
 */

/** 懸念の発生源 — 4 つの確認フローに対応 */
export type ConcernSource = "delivery_receipt" | "parts_confirmation" | "body_repair_consent" | "body_repair_tracking";

export const CONCERN_SOURCES = [
  "delivery_receipt",
  "parts_confirmation",
  "body_repair_consent",
  "body_repair_tracking",
] as const;

/** 懸念カテゴリ */
export type ConcernCategory = "work_quality" | "wrong_parts" | "pricing" | "damage" | "other";

export const CONCERN_CATEGORIES = ["work_quality", "wrong_parts", "pricing", "damage", "other"] as const;

export const CONCERN_CATEGORY_LABELS: Record<ConcernCategory, string> = {
  work_quality: "仕上がりの品質",
  wrong_parts: "部品の間違い",
  pricing: "金額・料金",
  damage: "損傷・キズ",
  other: "その他",
};

/** 懸念ステータス */
export type ConcernStatus = "open" | "investigating" | "resolved" | "dismissed";

export const CONCERN_STATUSES = ["open", "investigating", "resolved", "dismissed"] as const;

export const CONCERN_STATUS_LABELS: Record<ConcernStatus, string> = {
  open: "未対応",
  investigating: "調査中",
  resolved: "解決済み",
  dismissed: "却下",
};

/** DB テーブル行の型 */
export interface CustomerConcern {
  id: string;
  tenant_id: string;
  source_type: ConcernSource;
  source_token: string;
  job_id: string | null;
  certificate_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  concern_text: string;
  category: ConcernCategory | null;
  status: ConcernStatus;
  admin_response: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 顧客が懸念を作成するときの入力 */
export interface CreateConcernInput {
  source_type: ConcernSource;
  source_token: string;
  job_id?: string;
  certificate_id?: string;
  customer_name?: string;
  customer_email?: string;
  concern_text: string;
  category?: ConcernCategory;
}

/**
 * 「未解決」とみなすステータス — `src/lib/concerns/blockCheck.ts` の
 * `hasUnresolvedConcerns()` が実際のクエリでこの一覧を `.in("status", ...)` に使う。
 * IMP-028 の Certificate Gate はそのヘルパーを呼び出して使う。
 */
export const UNRESOLVED_CONCERN_STATUSES = ["open", "investigating"] as const;
