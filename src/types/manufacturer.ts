// ============================================================
// Manufacturer · Manufacturer Templates · Certified Tenants
// ============================================================
// Domain types backing the 認定施工店 / メーカー指定デザイン feature.
// See supabase/migrations/20260514100000_manufacturer_certifications.sql

import type { TemplateConfig } from "./templateOption";

export type ManufacturerServiceType = "coating" | "ppf" | "maintenance" | "body_repair" | "general";

export type ManufacturerCertificationStatus = "active" | "revoked";

// ---- DB Row Types ----------------------------------------------------------

export type ManufacturerRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  logo_asset_path: string | null;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ManufacturerTemplateRow = {
  id: string;
  manufacturer_id: string;
  name: string;
  description: string | null;
  service_type: ManufacturerServiceType | null;
  config_json: TemplateConfig;
  layout_key: string;
  thumbnail_path: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ManufacturerCertifiedTenantRow = {
  id: string;
  manufacturer_id: string;
  tenant_id: string;
  status: ManufacturerCertificationStatus;
  notes: string | null;
  certified_at: string;
  certified_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ManufacturerMembershipRole = "admin" | "viewer";

export type ManufacturerMembershipRow = {
  id: string;
  manufacturer_id: string;
  user_id: string;
  role: ManufacturerMembershipRole;
  display_name: string | null;
  is_active: boolean;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
};

// ---- Display labels --------------------------------------------------------

export const MANUFACTURER_SERVICE_TYPE_LABELS: Record<ManufacturerServiceType, string> = {
  coating: "コーティング",
  ppf: "PPF",
  maintenance: "整備",
  body_repair: "鈑金塗装",
  general: "汎用",
};

export const MANUFACTURER_CERTIFICATION_STATUS_LABELS: Record<ManufacturerCertificationStatus, string> = {
  active: "認定中",
  revoked: "解除済み",
};

// ============================================================
// Field Test (実証テスト) Types
// ============================================================

export type FtProjectStatus = "draft" | "recruiting" | "active" | "completed" | "archived";
export type FtApplicationStatus = "pending" | "approved" | "rejected" | "withdrawn";
export type FtAgreementType = "nda" | "terms" | "other";
export type FtJobStatus = "assigned" | "in_progress" | "evidence_submitted" | "inspection" | "completed" | "rejected";
export type FtEvidenceType =
  "photo_before" | "photo_during" | "photo_after" | "measurement" | "env_data" | "video" | "document" | "other";
export type FtInspectionResult = "pending" | "pass" | "fail" | "conditional_pass";
export type FtDefectSeverity = "low" | "medium" | "high" | "critical";
export type FtDefectStatus = "open" | "investigating" | "resolved" | "closed" | "wontfix";
export type FtConditionCheckType = "boolean" | "numeric" | "text" | "photo";

// ---- Field Test Row Types -------------------------------------------------

export type FtProjectRow = {
  id: string;
  manufacturer_id: string;
  name: string;
  description: string | null;
  product_name: string | null;
  product_spec: Record<string, unknown>;
  budget: number | null;
  target_units: number | null;
  conditions: Record<string, unknown>;
  status: FtProjectStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FtRecruitmentRow = {
  id: string;
  project_id: string;
  manufacturer_id: string;
  title: string;
  description: string | null;
  required_certifications: string[];
  max_participants: number | null;
  deadline: string | null;
  is_open: boolean;
  created_at: string;
  updated_at: string;
};

export type FtApplicationRow = {
  id: string;
  recruitment_id: string;
  project_id: string;
  manufacturer_id: string;
  tenant_id: string;
  applied_by: string | null;
  status: FtApplicationStatus;
  notes: string | null;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FtAgreementRow = {
  id: string;
  project_id: string;
  manufacturer_id: string;
  tenant_id: string;
  agreement_type: FtAgreementType;
  document_url: string | null;
  document_text: string | null;
  accepted: boolean;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FtTrainingModuleRow = {
  id: string;
  project_id: string;
  manufacturer_id: string;
  title: string;
  description: string | null;
  content_url: string | null;
  sort_order: number;
  is_required: boolean;
  created_at: string;
  updated_at: string;
};

export type FtTrainingCompletionRow = {
  id: string;
  module_id: string;
  tenant_id: string;
  completed_by: string | null;
  completed_at: string;
  created_at: string;
};

export type FtJobRow = {
  id: string;
  project_id: string;
  manufacturer_id: string;
  tenant_id: string;
  job_code: string | null;
  title: string;
  description: string | null;
  status: FtJobStatus;
  conditions_snapshot: Record<string, unknown>;
  assigned_by: string | null;
  assigned_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FtConditionRow = {
  id: string;
  project_id: string;
  manufacturer_id: string;
  label: string;
  description: string | null;
  check_type: FtConditionCheckType;
  numeric_min: number | null;
  numeric_max: number | null;
  unit: string | null;
  is_required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type FtConditionCheckRow = {
  id: string;
  job_id: string;
  condition_id: string;
  value_boolean: boolean | null;
  value_numeric: number | null;
  value_text: string | null;
  value_photo_path: string | null;
  checked_by: string | null;
  checked_at: string;
  created_at: string;
};

export type FtEvidenceRow = {
  id: string;
  job_id: string;
  project_id: string;
  manufacturer_id: string;
  tenant_id: string;
  evidence_type: FtEvidenceType;
  file_path: string | null;
  file_name: string | null;
  content_type: string | null;
  caption: string | null;
  metadata: Record<string, unknown>;
  captured_at: string | null;
  captured_by: string | null;
  created_at: string;
};

export type FtInspectionRow = {
  id: string;
  job_id: string;
  project_id: string;
  manufacturer_id: string;
  inspector_user_id: string | null;
  result: FtInspectionResult;
  score: number | null;
  notes: string | null;
  checklist: unknown[];
  inspected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FtDefectRow = {
  id: string;
  job_id: string | null;
  project_id: string;
  manufacturer_id: string;
  tenant_id: string | null;
  defect_code: string | null;
  title: string;
  description: string | null;
  severity: FtDefectSeverity;
  status: FtDefectStatus;
  resolution: string | null;
  reported_by: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

// ---- Field Test Display Labels --------------------------------------------

export const FT_PROJECT_STATUS_LABELS: Record<FtProjectStatus, string> = {
  draft: "下書き",
  recruiting: "募集中",
  active: "実施中",
  completed: "完了",
  archived: "アーカイブ",
};

export const FT_APPLICATION_STATUS_LABELS: Record<FtApplicationStatus, string> = {
  pending: "審査中",
  approved: "承認",
  rejected: "却下",
  withdrawn: "取下げ",
};

export const FT_JOB_STATUS_LABELS: Record<FtJobStatus, string> = {
  assigned: "割当済",
  in_progress: "施工中",
  evidence_submitted: "証拠提出済",
  inspection: "検査中",
  completed: "完了",
  rejected: "差戻し",
};

export const FT_EVIDENCE_TYPE_LABELS: Record<FtEvidenceType, string> = {
  photo_before: "施工前写真",
  photo_during: "施工中写真",
  photo_after: "施工後写真",
  measurement: "計測データ",
  env_data: "環境データ",
  video: "動画",
  document: "書類",
  other: "その他",
};

export const FT_INSPECTION_RESULT_LABELS: Record<FtInspectionResult, string> = {
  pending: "未検査",
  pass: "合格",
  fail: "不合格",
  conditional_pass: "条件付合格",
};

export const FT_DEFECT_SEVERITY_LABELS: Record<FtDefectSeverity, string> = {
  low: "軽微",
  medium: "中",
  high: "重大",
  critical: "致命的",
};

export const FT_DEFECT_STATUS_LABELS: Record<FtDefectStatus, string> = {
  open: "未対応",
  investigating: "調査中",
  resolved: "解決済",
  closed: "クローズ",
  wontfix: "対応不要",
};

export const FT_AGREEMENT_TYPE_LABELS: Record<FtAgreementType, string> = {
  nda: "秘密保持契約",
  terms: "利用規約",
  other: "その他",
};

// ============================================================
// Workshop Capability Profile
// ============================================================

export type WorkshopCapabilityProfileRow = {
  id: string;
  tenant_id: string;
  permits: { type: string; number?: string; expires_at?: string }[];
  mechanic_certifications: { grade: string; holder_name?: string; cert_number?: string }[];
  has_lift: boolean;
  has_diagnostic_tools: boolean;
  has_adas_equipment: boolean;
  equipment_notes: string | null;
  ev_capable: boolean;
  body_work: boolean;
  painting: boolean;
  coating: boolean;
  ppf: boolean;
  electrical: boolean;
  mobile_service: boolean;
  supported_vehicles: string[];
  service_area: { prefectures?: string[]; radius_km?: number; notes?: string };
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
};

export const WORKSHOP_CAPABILITY_LABELS: Record<string, string> = {
  has_lift: "リフト",
  has_diagnostic_tools: "診断機",
  has_adas_equipment: "ADAS設備",
  ev_capable: "EV対応",
  body_work: "鈑金",
  painting: "塗装",
  coating: "コーティング",
  ppf: "PPF",
  electrical: "電装",
  mobile_service: "出張対応",
};
