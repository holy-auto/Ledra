/**
 * POS 共有定数
 *
 * Ledra Web と React Native POS アプリの両方で使用する定数。
 * RN アプリへはこのファイルをコピーして共有する。
 */

export const PAYMENT_METHODS = [
  { value: "cash", label: "現金" },
  { value: "card", label: "カード" },
  { value: "qr", label: "QR決済" },
  { value: "bank_transfer", label: "振込" },
  { value: "other", label: "その他" },
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]["value"];

export const VALID_PAYMENT_METHODS: readonly string[] = PAYMENT_METHODS.map((m) => m.value);

export const RESERVATION_STATUS_MAP: Record<
  string,
  { variant: "default" | "success" | "warning" | "danger" | "info" | "violet"; label: string }
> = {
  confirmed: { variant: "info", label: "確定" },
  arrived: { variant: "violet", label: "来店" },
  in_progress: { variant: "warning", label: "作業中" },
  completed: { variant: "success", label: "完了" },
  cancelled: { variant: "danger", label: "キャンセル" },
};

export const RESERVATION_PAYMENT_STATUS_MAP: Record<
  string,
  { variant: "default" | "success" | "warning" | "danger"; label: string }
> = {
  unpaid: { variant: "default", label: "未会計" },
  paid: { variant: "success", label: "会計済" },
  partial: { variant: "warning", label: "一部入金" },
  refunded: { variant: "danger", label: "返金済" },
};
