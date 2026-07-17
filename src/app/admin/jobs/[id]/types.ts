/**
 * 案件ワークフロー画面の共有型
 * JobStatusPanel / JobDetailTabs / JobTabsLoader / page で共用。
 */

export type MenuItem = { menu_item_id?: string; name: string; price: number };

/** 申し送りメモ 1 件 (reservations.handoff_notes JSONB 配列の要素)。 */
export type HandoffNote = {
  id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
  priority: "normal" | "important" | "urgent";
};

/** AI 証明書下書きの本体 (1 カテゴリー分)。 */
export type AiCertificateDraftBody = {
  title: string;
  description: string;
  materials: Array<{ name: string; maker?: string; spec?: string; note?: string }>;
  warrantyCandidates: string[];
  workAreas: string[];
  cautions: string;
  confidence: number;
  missingInfo?: string[];
};

/** 大カテゴリー単位の下書き 1 件 (複数種類の作業依頼を分けたときの要素)。 */
export type AiCertificateCategorizedDraft = {
  category: string;
  categoryLabel: string;
  workItems: string[];
  draft: AiCertificateDraftBody;
  policies?: Record<string, "auto" | "suggest" | "manual">;
};

/** certificate.auto_draft が reservations.ai_certificate_draft に保存するスナップショット。 */
export type AiCertificateDraft = {
  /** primary (drafts[0]) 相当。後方互換のため常に単一の draft も保持する。 */
  draft: AiCertificateDraftBody;
  policies?: Record<string, "auto" | "suggest" | "manual">;
  /** 複数種類の作業依頼を大カテゴリーごとに分けた下書き。1 カテゴリーなら省略/1 件。 */
  drafts?: AiCertificateCategorizedDraft[];
  auto?: boolean;
  generated_at?: string;
};

/** mechanic.auto_assign_suggest が reservations.ai_assignee_suggestion に保存するスナップショット。 */
export type AiAssigneeCandidate = {
  staff_id: string;
  staff_name: string;
  score: number;
  method: "skill" | "history" | "ai" | "fallback";
  reason: string;
};
export type AiAssigneeSuggestion = {
  candidates: AiAssigneeCandidate[];
  ai?: boolean;
  service_type?: string | null;
  job_tags?: string[];
  auto?: boolean;
  generated_at?: string;
};

/** ワークフローテンプレートの1工程 (advance API と同じ形)。 */
export type WorkflowStep = {
  order: number;
  key: string;
  label: string;
  is_customer_visible: boolean;
  estimated_min: number;
};

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
  assigned_user_id: string | null;
  assigned_staff_id: string | null;
  booth_id: string | null;
  work_started_at: string | null;
  work_completed_at: string | null;
  // 案件サインオフ・ワークフロー (詳細状態は GET /signoff-state で取得)
  signoff_status?: "not_requested" | "awaiting" | "signed" | null;
  signoff_deadline?: string | null;
  signed_off_at?: string | null;
  created_at: string;
  ai_certificate_draft?: AiCertificateDraft | null;
  ai_assignee_suggestion?: AiAssigneeSuggestion | null;
  handoff_notes?: HandoffNote[] | null;
  // 工程テンプレート駆動のワークフロー (POST .../advance で進行)
  workflow_template_id?: string | null;
  current_step_key?: string | null;
  current_step_order?: number | null;
  progress_pct?: number | null;
  // 部品交換あり。ON でバックエンドが装着記録 (draft) を自動作成する。
  parts_replacement?: boolean | null;
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

export const STATUS_FLOW = ["confirmed", "arrived", "in_progress", "completed"] as const;

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
