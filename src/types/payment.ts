export type PaymentMethod = 'cash' | 'card' | 'qr' | 'bank_transfer' | 'other';
export type PaymentStatus = 'completed' | 'refunded' | 'partial_refund' | 'voided';

export interface PaymentRow {
  id: string;
  tenant_id: string;
  store_id: string | null;
  document_id: string | null;
  reservation_id: string | null;
  customer_id: string | null;
  register_session_id: string | null;
  payment_method: PaymentMethod;
  amount: number;
  received_amount: number | null;
  change_amount: number;
  status: PaymentStatus;
  refund_amount: number;
  refund_reason: string | null;
  note: string | null;
  paid_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
