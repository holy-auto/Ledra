/** 帳票種別マスタ */
export const DOC_TYPES = {
  estimate: { label: "見積書", prefix: "EST", color: "info" as const },
  delivery: { label: "納品書", prefix: "DLV", color: "success" as const },
  purchase_order: { label: "発注書", prefix: "PO", color: "warning" as const },
  order_confirmation: { label: "発注請書", prefix: "OC", color: "warning" as const },
  inspection: { label: "検収書", prefix: "INS", color: "success" as const },
  receipt: { label: "領収書", prefix: "RCP", color: "success" as const },
  invoice: { label: "請求書", prefix: "INV", color: "danger" as const },
  consolidated_invoice: { label: "合算請求書", prefix: "CINV", color: "danger" as const },
} as const;

export type DocType = keyof typeof DOC_TYPES;

export const DOC_TYPE_LIST = Object.entries(DOC_TYPES).map(([value, meta]) => ({
  value: value as DocType,
  ...meta,
}));

export type DocumentStatus = "draft" | "sent" | "accepted" | "paid" | "rejected" | "cancelled";

export const STATUS_OPTIONS: { value: DocumentStatus | "all"; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "draft", label: "下書き" },
  { value: "sent", label: "送付済" },
  { value: "accepted", label: "受理済" },
  { value: "paid", label: "入金済" },
  { value: "rejected", label: "却下" },
  { value: "cancelled", label: "キャンセル" },
];

export function statusLabel(s: string): string {
  const found = STATUS_OPTIONS.find((o) => o.value === s);
  return found?.label ?? s;
}

export function statusVariant(s: string) {
  switch (s) {
    case "draft":
      return "default" as const;
    case "sent":
      return "info" as const;
    case "accepted":
      return "info" as const;
    case "paid":
      return "success" as const;
    case "rejected":
      return "danger" as const;
    case "cancelled":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

/** ステータス遷移マップ */
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent"],
  sent: ["accepted", "paid", "rejected", "cancelled"],
  accepted: ["paid", "cancelled"],
  rejected: [],
  paid: [],
  cancelled: [],
};

export type DocumentItem = {
  description: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  amount: number;
  tax_category?: number; // 10 or 8 (軽減税率)
  certificate_id?: string | null;
  certificate_public_id?: string | null;
};

export type RecipientHonorific = "御中" | "様" | "";

export const GREETING_BY_DOC_TYPE: Record<DocType, string> = {
  estimate: "下記のとおりお見積り申し上げます。",
  invoice: "下記のとおりご請求申し上げます。",
  consolidated_invoice: "下記のとおりご請求申し上げます。",
  delivery: "下記のとおり納品いたしました。",
  purchase_order: "下記のとおり発注いたします。",
  order_confirmation: "下記のとおりご注文を承りました。",
  inspection: "下記のとおり検収いたしました。",
  receipt: "下記のとおり領収いたしました。",
};

export type DocumentRow = {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  customer_name?: string | null;
  doc_type: DocType;
  doc_number: string;
  issued_at: string | null;
  due_date: string | null;
  status: DocumentStatus;
  subtotal: number;
  tax: number;
  total: number;
  tax_rate: number;
  items_json: DocumentItem[];
  note: string | null;
  meta_json: Record<string, unknown>;
  is_invoice_compliant: boolean;
  source_document_id: string | null;
  show_seal: boolean;
  show_logo: boolean;
  show_bank_info: boolean;
  recipient_name: string | null;
  recipient_honorific: RecipientHonorific;
  recipient_postal_code: string | null;
  recipient_address: string | null;
  recipient_phone: string | null;
  subject: string | null;
  period_start: string | null;
  period_end: string | null;
  payment_terms: string | null;
  delivery_date: string | null;
  template_id: string | null;
  payment_date: string | null;
  vehicle_id: string | null;
  vehicle_info_json: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
};

/** 後方互換: Invoice 型は DocumentRow のエイリアス（doc_type='invoice'） */
export type InvoiceRow = DocumentRow & {
  invoice_number: string; // doc_number のエイリアス
};
