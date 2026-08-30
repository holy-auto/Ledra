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
  staff_invoice: { label: "外注請求書", prefix: "SINV", color: "warning" as const },
} as const;

export type DocType = keyof typeof DOC_TYPES;

/**
 * 自社が発行する書類（相手への敬称ではなく自社の行為を表す）は「御」を付けない。
 * 挨拶文（GREETING_BY_DOC_TYPE）が「発注いたします」「検収いたしました」など
 * 自社主語のため、テナントの layout.title.prefix 設定に関わらず常に抑止する
 * （スタイル設定ではなく文章として誤りのため）。
 * PDF 生成（src/lib/pdfDocument.tsx）・admin のライブプレビュー（LayoutPreview.tsx）・
 * テンプレート編集画面（TemplatesClient.tsx）の唯一の出所。
 */
const NO_HONORIFIC_PREFIX_DOC_TYPES = new Set<DocType>(["purchase_order", "order_confirmation", "inspection"]);

/** doc_type が自社発行の書類（「御」を付けない対象）か判定する。 */
export function hasNoHonorificPrefix(docType: string): boolean {
  return NO_HONORIFIC_PREFIX_DOC_TYPES.has(docType as DocType);
}

export const DOC_TYPE_LIST = Object.entries(DOC_TYPES).map(([value, meta]) => ({
  value: value as DocType,
  ...meta,
}));

export type DocumentStatus = "draft" | "sent" | "accepted" | "paid" | "overdue" | "rejected" | "cancelled";

export const STATUS_OPTIONS: { value: DocumentStatus | "all"; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "draft", label: "下書き" },
  { value: "sent", label: "送付済" },
  { value: "accepted", label: "受理済" },
  { value: "paid", label: "入金済" },
  { value: "overdue", label: "期限超過" },
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
    case "overdue":
      return "danger" as const;
    case "rejected":
      return "danger" as const;
    case "cancelled":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

/** ステータス遷移マップ（見積書・納品書等、一般帳票用） */
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent"],
  sent: ["accepted", "paid", "overdue", "rejected", "cancelled"],
  accepted: ["paid", "cancelled"],
  overdue: ["paid", "cancelled"],
  rejected: [],
  paid: [],
  cancelled: [],
};

/**
 * 請求書・合算請求書専用のステータス遷移マップ。
 * 見積書由来の「受理/却下」は請求書には存在しない概念のため対象外にする
 * （却下に遷移すると次の遷移先が無くなり、入金確定に戻せなくなるため）。
 */
const INVOICE_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent"],
  sent: ["paid", "overdue", "cancelled"],
  overdue: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

/** invoice 系のステータス遷移マップを使う帳票種別（受理/却下の概念を持たない）。 */
const INVOICE_LIKE_DOC_TYPES = new Set(["invoice", "consolidated_invoice", "staff_invoice"]);

/** doc_type に応じた次のステータス遷移候補を返す。 */
export function nextStatusesFor(docType: string, status: string): string[] {
  const map = INVOICE_LIKE_DOC_TYPES.has(docType) ? INVOICE_STATUS_TRANSITIONS : STATUS_TRANSITIONS;
  return map[status] ?? [];
}

/**
 * 帳票変換の許容マップ。キーの doc_type から、値の doc_type へ「変換」できる
 * (元帳票の宛先・明細・税設定等を引き継いで新規帳票を作成する)。
 * 新しい変換パターンを追加する場合はここに1行足すだけでよい。
 */
export const CONVERSION_TARGETS: Partial<Record<DocType, DocType[]>> = {
  estimate: ["delivery", "invoice"],
  delivery: ["invoice"],
};

/**
 * 帳票が編集可能か判定する。
 * - 請求書（invoice / consolidated_invoice）は送付後（draft 以外）は編集不可
 * - その他の帳票は基本的に常に編集可能
 */
export function isDocumentEditable(docType: string, status: string): boolean {
  if (INVOICE_LIKE_DOC_TYPES.has(docType) && status !== "draft") {
    return false;
  }
  return true;
}

/**
 * 帳票が削除可能か判定する。
 * - 下書きはいつでも削除可能（証跡として確定していないため）
 * - 領収書（receipt）は POS 等で status='paid' 固定のまま発行され下書きを経由しないため、
 *   ステータスを問わず削除可能とする（誤発行の取り消し用途）
 * - それ以外の送付済み帳票（見積書・請求書等）は証跡保持のため下書きのみ削除可
 */
export function isDocumentDeletable(docType: string, status: string): boolean {
  return status === "draft" || docType === "receipt";
}

/**
 * 明細行のタイプ。
 * - "item"（既定）: 通常の品目行（数量×単価＝金額）
 * - "heading": セクション見出し行（金額計算には含めない）
 * - "subtotal": 小計行。直前の小計行（または先頭）から累積した item の合計を表示し、
 *               文書合計には含めない（重複計上を避けるため）。
 */
export type DocumentItemType = "item" | "heading" | "subtotal";

export type DocumentItem = {
  item_type?: DocumentItemType;
  /** 品番。品目マスタ(menu_items)の item_code と紐付け、帳票作成時の検索に使う。 */
  item_code?: string | null;
  description: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  amount: number;
  /** 原価（円）。利益率と組み合わせて unit_price を自動算出する基準値。 */
  cost_price?: number;
  /** 利益率（％、マークアップ率）。unit_price = round(cost_price × (1 + margin_rate/100)) */
  margin_rate?: number | null;
  tax_category?: number; // 10 or 8 (軽減税率)
  certificate_id?: string | null;
  certificate_public_id?: string | null;
  /**
   * 数量入力欄の編集中の生文字列（UI専用、保存はしない）。
   * quantity は再パース後の数値なので、コントロール入力に直接使うと
   * 「0」や末尾の小数点(例: "0."）が再描画で消えてしまう。入力中はこちらを表示する。
   */
  _quantity_text?: string;
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
  staff_invoice: "下記のとおり外注費をご請求申し上げます。",
};

export type DocumentRow = {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  customer_name?: string | null;
  /** 外注請求書 (doc_type=staff_invoice) の宛先となる外注職人。顧客向け帳票では常に null。 */
  staff_member_id?: string | null;
  doc_type: DocType;
  doc_number: string;
  issued_at: string | null;
  due_date: string | null;
  status: DocumentStatus;
  subtotal: number;
  tax: number;
  total: number;
  tax_rate: number;
  /** 税率ごとの内訳（適格請求書の複数税率区分表示用）。null は未計算・非対応の旧データ。 */
  tax_breakdown?: { rate: number; subtotal: number; tax: number }[] | null;
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
