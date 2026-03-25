export type CertificateStatus = "active" | "void" | "expired" | "draft";

export type CertificateRow = {
  id?: string;
  public_id: string;
  status: string;
  customer_name: string;
  created_at: string;
  updated_at?: string;
  vehicle_id?: string | null;
  vehicle_info_json?: unknown;
  tenant_id?: string | null;
  certificate_no?: string | null;
  service_type?: string | null;
};

export type NfcStatus = "prepared" | "written" | "attached" | "lost" | "retired" | "error";
