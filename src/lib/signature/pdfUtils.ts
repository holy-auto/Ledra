/**
 * Ledra 電子署名 - PDF ユーティリティ
 *
 * 証明書 PDF のバイト列生成と、
 * 署名情報が埋め込まれた PDF の再生成を担当する。
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { renderCertificatePdf, type CertRow } from "@/lib/pdfCertificate";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.APP_URL ?? "https://ledra.jp";

/** PDF に埋め込む署名情報 */
export interface PdfSignatureInfo {
  signedAt: string;
  signerEmail: string;
  signerName?: string;
  signaturePreview: string;
  publicKeyFingerprint: string;
  verifyUrl: string;
  documentHash: string;
}

/** select した列を Row 型として取り出すための形。`certificates` テーブルの JSON カラムは構造が
 * 多岐にわたるため CertRow と同じく `Record<string, unknown>` / `unknown[]` に絞る。 */
type CertSelectRow = {
  id: string;
  public_id: string;
  customer_name: string | null;
  vehicle_info_json: Record<string, unknown> | null;
  content_free_text: string | null;
  content_preset_json: Record<string, unknown> | null;
  coating_products_json: Record<string, unknown>[] | null;
  ppf_coverage_json: Record<string, unknown>[] | null;
  maintenance_json: Record<string, unknown> | null;
  body_repair_json: Record<string, unknown> | null;
  service_type: string | null;
  expiry_type: string | null;
  expiry_value: string | null;
  warranty_period_end: string | null;
  warranty_exclusions: string | null;
  logo_asset_path: string | null;
  current_version: number | null;
  created_at: string | null;
  tenant: { custom_domain: string | null } | null;
};

/**
 * 証明書 PDF のバイト列を生成する。
 *
 * 署名前のハッシュ計算に使用する。
 * 証明書データを Supabase から取得し、renderCertificatePdf で PDF を生成する。
 *
 * @param certificateId - 証明書 UUID
 * @returns PDF バイト列（Uint8Array）
 * @throws 証明書が見つからない場合、PDF 生成失敗時
 */
export async function generateCertificatePdfBytes(certificateId: string): Promise<Uint8Array> {
  const supabase = getSupabaseAdmin();

  const { data: cert, error } = await supabase
    .from("certificates")
    .select(
      `
      id,
      public_id,
      customer_name,
      vehicle_info_json,
      content_free_text,
      content_preset_json,
      coating_products_json,
      ppf_coverage_json,
      maintenance_json,
      body_repair_json,
      service_type,
      expiry_type,
      expiry_value,
      warranty_period_end,
      warranty_exclusions,
      logo_asset_path,
      current_version,
      created_at,
      tenant:tenants(custom_domain)
    `,
    )
    .eq("id", certificateId)
    .single<CertSelectRow>();

  if (error || !cert) {
    throw new Error(`[pdfUtils] Certificate not found: ${certificateId}`);
  }

  const tenantDomain = cert.tenant?.custom_domain ?? null;
  const origin = tenantDomain ? `https://${tenantDomain}` : BASE_URL;
  const publicUrl = `${origin}/c/${cert.public_id}`;

  // CertRow は Record<string, any> を許容するので Record<string, unknown>
  // からは直接代入できない。ここだけ一度 any 経由で橋渡しする。将来
  // CertRow 自体を unknown ベースに絞る PR を別に切る想定。
  const row: CertRow = {
    public_id: cert.public_id,
    tenant_custom_domain: tenantDomain,
    customer_name: cert.customer_name ?? "",
    vehicle_info_json: (cert.vehicle_info_json ?? {}) as Record<string, unknown>,
    content_free_text: cert.content_free_text ?? null,
    content_preset_json: (cert.content_preset_json ?? {}) as Record<string, unknown>,
    coating_products_json: cert.coating_products_json ?? null,
    ppf_coverage_json: cert.ppf_coverage_json ?? null,
    maintenance_json: cert.maintenance_json ?? null,
    body_repair_json: cert.body_repair_json ?? null,
    service_type: cert.service_type ?? null,
    expiry_type: cert.expiry_type ?? null,
    expiry_value: cert.expiry_value ?? null,
    warranty_period_end: cert.warranty_period_end ?? null,
    warranty_exclusions: cert.warranty_exclusions ?? null,
    logo_asset_path: cert.logo_asset_path ?? null,
    created_at: cert.created_at ?? new Date().toISOString(),
    current_version: cert.current_version ?? null,
  };

  const buffer = await renderCertificatePdf(row, publicUrl);
  return new Uint8Array(buffer);
}

/**
 * 署名済み証明書 PDF を Supabase Storage に保存する。
 *
 * 署名完了後に非同期で呼び出す（void で使用）。
 * 生成した PDF は assets バケットの
 * certificates/{certificateId}/signed_certificate.pdf に保存される。
 *
 * @param certificateId - 証明書 UUID
 * @param signatureInfo - 埋め込む署名情報（将来の UI 表示用）
 */
export async function regenerateSignedPdf(certificateId: string, signatureInfo: PdfSignatureInfo): Promise<void> {
  try {
    const pdfBytes = await generateCertificatePdfBytes(certificateId);

    const supabase = getSupabaseAdmin();
    const storagePath = `certificates/${certificateId}/signed_certificate.pdf`;

    const { error: uploadError } = await supabase.storage.from("assets").upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

    if (uploadError) {
      console.error("[pdfUtils] Failed to upload signed PDF:", uploadError.message);
      return;
    }

    // 署名完了日時を certificates テーブルに記録
    await supabase.from("certificates").update({ signed_at: signatureInfo.signedAt }).eq("id", certificateId);

    console.info("[pdfUtils] Signed PDF stored:", storagePath);
  } catch (err) {
    console.error("[pdfUtils] regenerateSignedPdf failed:", err);
  }
}
