import { createAdminClient } from "@/lib/supabase/admin";

export type CertificateAuditType =
  | "certificate_issued"
  | "certificate_voided"
  | "certificate_viewed"
  | "certificate_pdf_generated"
  | "certificate_pdf_batch"
  | "certificate_public_viewed"
  | "certificate_public_pdf";

const TITLE_MAP: Record<CertificateAuditType, string> = {
  certificate_issued: "証明書を発行",
  certificate_voided: "証明書を無効化",
  certificate_viewed: "証明書を閲覧",
  certificate_pdf_generated: "PDFを生成",
  certificate_pdf_batch: "PDFを一括生成",
  certificate_public_viewed: "公開ページが閲覧された",
  certificate_public_pdf: "公開PDFが閲覧された",
};

/**
 * 証明書関連の操作を vehicle_histories に記録する。
 * 失敗しても呼び出し元をブロックしない（fire-and-forget）。
 */
export async function logCertificateAction(params: {
  type: CertificateAuditType;
  tenantId: string;
  publicId: string;
  certificateId?: string | null;
  vehicleId?: string | null;
  userId?: string | null;
  description?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const desc = params.description
      ?? [
        `Public ID: ${params.publicId}`,
        params.userId ? `User: ${params.userId}` : null,
        params.ip ? `IP: ${params.ip}` : null,
      ]
        .filter(Boolean)
        .join(" / ");

    await admin.from("vehicle_histories").insert({
      tenant_id: params.tenantId,
      vehicle_id: params.vehicleId ?? null,
      certificate_id: params.certificateId ?? null,
      type: params.type,
      title: TITLE_MAP[params.type] ?? params.type,
      description: desc,
      performed_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[audit] logCertificateAction failed:", e);
  }
}

/** リクエストから IP / User-Agent を取得 */
export function getRequestMeta(req: Request) {
  return {
    ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  };
}
