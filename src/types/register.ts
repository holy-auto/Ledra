export type Register = {
  id: string;
  tenant_id: string;
  store_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type RegisterSessionStatus = "open" | "closed";

export type RegisterSession = {
  id: string;
  tenant_id: string;
  register_id: string;
  opened_by: string;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_difference: number | null;
  total_sales: number;
  total_transactions: number;
  note: string | null;
  status: RegisterSessionStatus;
  created_at: string;
  updated_at: string;
};
