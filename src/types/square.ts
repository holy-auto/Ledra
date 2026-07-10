export type SquareConnectionStatus = "active" | "pending" | "disconnected" | "error";

export type SquareConnection = {
  id: string;
  tenant_id: string;
  square_merchant_id: string;
  status: SquareConnectionStatus;
  connected_at: string | null;
  last_synced_at: string | null;
  square_location_ids: string[];
  /** 直近のエラー原因 (status="error" 時のみ意味あり)。例: "token_expired" "rate_limited" */
  last_error_reason?: string | null;
  /** 直近のエラー検出時刻 */
  last_error_at?: string | null;
};

export type SquareOrder = {
  id: string;
  tenant_id: string;
  square_order_id: string;
  square_location_id: string;
  order_state: string;
  total_amount: number;
  tax_amount: number;
  net_amount: number;
  currency: string;
  payment_methods: string[];
  items_json: any[];
  square_customer_id: string | null;
  square_receipt_url: string | null;
  square_created_at: string;
  square_closed_at: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  certificate_id: string | null;
  receipt_document_id: string | null;
  note: string | null;
  synced_at: string;
  // Joined fields
  customer_name?: string;
  vehicle_display?: string;
};

export type SquareSyncRun = {
  id: string;
  tenant_id: string;
  started_at: string;
  finished_at: string | null;
  status: "queued" | "processing" | "running" | "completed" | "failed" | "partial";
  trigger_type: "manual" | "scheduled" | "webhook";
  triggered_by: string | null;
  orders_fetched: number;
  orders_imported: number;
  orders_skipped: number;
  errors_json: any[];
  error_message: string | null;
};

/**
 * Subset of the Square Orders API response shape used during sync.
 * Reference: https://developer.squareup.com/reference/square/orders-api/search-orders
 *
 * Kept narrow on purpose — we read the documented fields below and pass
 * `tenders` / `line_items` opaquely through to JSONB columns. Extend only
 * when we start decoding more.
 */
export interface SquareApiMoney {
  amount?: number;
  currency?: string;
}

export interface SquareApiTender {
  id?: string;
  type?: string;
  receipt_url?: string;
  amount_money?: SquareApiMoney;
  [key: string]: unknown;
}

export interface SquareApiLineItem {
  uid?: string;
  name?: string;
  quantity?: string;
  base_price_money?: SquareApiMoney;
  total_money?: SquareApiMoney;
  [key: string]: unknown;
}

export interface SquareApiOrder {
  id: string;
  location_id?: string;
  state?: string;
  total_money?: SquareApiMoney;
  total_tax_money?: SquareApiMoney;
  total_discount_money?: SquareApiMoney;
  total_tip_money?: SquareApiMoney;
  tenders?: SquareApiTender[];
  line_items?: SquareApiLineItem[];
  customer_id?: string | null;
  created_at?: string;
  closed_at?: string | null;
  [key: string]: unknown;
}

export interface SquareSearchOrdersResponse {
  orders?: SquareApiOrder[];
  cursor?: string;
}
