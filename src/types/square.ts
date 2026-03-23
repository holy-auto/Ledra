export type SquareConnectionStatus = "active" | "pending" | "disconnected" | "error";

export type SquareConnection = {
  id: string;
  tenant_id: string;
  square_merchant_id: string;
  status: SquareConnectionStatus;
  connected_at: string | null;
  last_synced_at: string | null;
  square_location_ids: string[];
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
  status: "running" | "completed" | "failed" | "partial";
  trigger_type: "manual" | "scheduled" | "webhook";
  triggered_by: string | null;
  orders_fetched: number;
  orders_imported: number;
  orders_skipped: number;
  errors_json: any[];
};
