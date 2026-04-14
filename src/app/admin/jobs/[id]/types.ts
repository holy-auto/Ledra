/**
 * 案件ワークフロー画面の共有型
 * JobStatusPanel / JobDetailTabs / JobTabsLoader / page で共用。
 */

export type MenuItem = { menu_item_id?: string; name: string; price: number };

export type JobReservation = {
  id: string;
  title: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  estimated_amount: number | null;
  note: string | null;
  menu_items_json: MenuItem[] | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
};

export type JobCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
} | null;

export type JobVehicle = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  vin: string | null;
} | null;

export type JobCertificate = {
  public_id: string;
  status: string;
  created_at: string;
  service_price: number | null;
  customer_name: string | null;
};

export type JobDocument = {
  id: string;
  doc_number: string | null;
  doc_type: string;
  status: string;
  total: number | null;
  issued_at: string | null;
  due_date: string | null;
};

export const STATUS_FLOW = [
  "confirmed",
  "arrived",
  "in_progress",
  "completed",
] as const;

export const STATUS_LABEL: Record<string, string> = {
  confirmed: "予約確定",
  arrived: "来店・受付",
  in_progress: "作業中",
  completed: "完了・納車",
  cancelled: "キャンセル",
};

export const STATUS_HINT: Record<string, string> = {
  confirmed: "予約を受け付けました。来店確認を待ちます。",
  arrived: "お客様が来店しました。作業を開始してください。",
  in_progress: "作業中です。完了したら証明書発行 → 納車に進みます。",
  completed: "作業が完了しました。請求書発行 → 入金確認を行います。",
  cancelled: "この予約はキャンセルされています。",
};
