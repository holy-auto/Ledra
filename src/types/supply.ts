/**
 * 供給パートナー (卸元/メーカー) ドメイン型 — single source of truth。
 *
 * agents (紹介代理店) とは別エンティティ。supply_partners テーブル
 * (20260601000000_supply_partners.sql) に対応する。types/agent.ts と同じ作法。
 */

/** 供給パートナーの審査ステータス (agents と同じ語彙)。運営のみ変更可。 */
export type SupplyPartnerStatus = "active_pending_review" | "active" | "suspended";

/** 発注 API の認証方式。 */
export type SupplyApiAuthType = "none" | "api_key" | "bearer" | "oauth2";

/** API 連携の状態。 */
export type SupplyIntegrationStatus = "unconfigured" | "connected" | "error";

/** 発注の搬送方法 (purchase_orders.transport)。 */
export type SupplyTransport = "email" | "api" | "portal";

/** メーカーのポータル回答 (purchase_orders.partner_response)。 */
export type SupplyPartnerResponse = "pending" | "accepted" | "partial" | "declined";

/** 辞退理由 (purchase_orders.decline_reason)。 */
export type SupplyDeclineReason = "discontinued" | "out_of_stock" | "price_mismatch" | "min_lot" | "other";

export const SUPPLY_PARTNER_STATUS_LABELS: Record<SupplyPartnerStatus, string> = {
  active_pending_review: "審査待ち",
  active: "有効",
  suspended: "停止中",
};

export const SUPPLY_API_AUTH_TYPE_LABELS: Record<SupplyApiAuthType, string> = {
  none: "連携なし (メール発注)",
  api_key: "API キー",
  bearer: "Bearer トークン",
  oauth2: "OAuth2",
};

export const SUPPLY_INTEGRATION_STATUS_LABELS: Record<SupplyIntegrationStatus, string> = {
  unconfigured: "未設定",
  connected: "接続済み",
  error: "エラー",
};

export const SUPPLY_TRANSPORT_LABELS: Record<SupplyTransport, string> = {
  email: "メール発注",
  api: "API 連携",
  portal: "ポータル受注",
};

export const SUPPLY_PARTNER_RESPONSE_LABELS: Record<SupplyPartnerResponse, string> = {
  pending: "回答待ち",
  accepted: "受注",
  partial: "一部欠品",
  declined: "辞退",
};

export const SUPPLY_DECLINE_REASON_LABELS: Record<SupplyDeclineReason, string> = {
  discontinued: "廃番",
  out_of_stock: "在庫切れ",
  price_mismatch: "価格不一致",
  min_lot: "最低ロット未満",
  other: "その他",
};

export function normalizeSupplyPartnerResponse(raw: string | null | undefined): SupplyPartnerResponse {
  if (raw === "accepted" || raw === "partial" || raw === "declined") return raw;
  return "pending";
}

export function normalizeSupplyPartnerStatus(raw: string | null | undefined): SupplyPartnerStatus {
  if (raw === "active" || raw === "suspended") return raw;
  return "active_pending_review";
}

export function normalizeSupplyApiAuthType(raw: string | null | undefined): SupplyApiAuthType {
  if (raw === "api_key" || raw === "bearer" || raw === "oauth2") return raw;
  return "none";
}

/** パートナー本体の公開可能なプロフィール (機密でない列のみ)。 */
export interface SupplyPartnerProfile {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  status: SupplyPartnerStatus;
  agent_id: string | null;
  api_endpoint: string | null;
  api_auth_type: SupplyApiAuthType;
  integration_status: SupplyIntegrationStatus;
  last_order_at: string | null;
  created_at: string;
}

/** 商材カタログの 1 行。 */
export interface SupplyPartnerProduct {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  list_price: number | null;
  currency: string;
  stock_status: string | null;
  lead_time_days: number | null;
  is_active: boolean;
  updated_at: string;
}
