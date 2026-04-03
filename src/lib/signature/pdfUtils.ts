/**
 * Ledra 電子署名 - PDF ユーティリティ
 *
 * 証明書 PDF のバイト列生成と、
 * 署名情報が埋め込まれた PDF の再生成を担当する。
 *
 * 電子署名法第2条第2号（非改ざん性）の起点:
 * PDF のバイト列に対して SHA-256 を計算し、
 * その結果を ECDSA で署名することで
 * 「PDF が署名時点から改ざんされていない」ことを証明できる。
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { renderCertificatePdf, type CertRow, type PdfSignatureSection } from '@/lib/pdfCertificate';

/** PDF に埋め込む署名情報（pdfUtils 内部用 — pdfCertificate.tsx の PdfSignatureSection と共通） */
export type { PdfSignatureSection };

/**
 * 証明書 ID から証明書データを取得し、PDF バイト列を生成する。
 *
 * 署名前のハッシュ計算（document_hash）に使用する。
 * 既存の /admin/certificates/pdf-one ルートと同じクエリを使用する。
 *
 * @param certificateId - 証明書 UUID（certificates.id）
 * @returns PDF バイト列（Uint8Array）
 * @throws 証明書が見つからない場合、PDF 生成失敗時
 */
export async function generateCertificatePdfBytes(
  certificateId: string,
): Promise<Uint8Array> {
  const supabase = getSupabaseAdmin();

  // 証明書データを取得（pdf-one ルートと同じカラム）
  const { data: cert, error } = await supabase
    .from('certificates')
    .select(
      'public_id,customer_name,vehicle_info_json,content_free_text,' +
      'content_preset_json,expiry_type,expiry_value,logo_asset_path,' +
      'created_at,service_type,ppf_coverage_json,coating_products_json,' +
      'warranty_period_end,warranty_exclusions,current_version,' +
      'maintenance_json,body_repair_json,tenant_custom_domain',
    )
    .eq('id', certificateId)
    .single();

  if (error || !cert) {
    throw new Error(`[pdfUtils] Certificate not found: ${certificateId}`);
  }

  // Supabase 生成型と CertRow の差異を unknown 経由で吸収
  const certRow = cert as unknown as CertRow;

  // 公開ページ URL の構築
  const appUrl = process.env.APP_URL ?? 'https://ledra.co.jp';
  const baseUrl = certRow.tenant_custom_domain
    ? `https://${certRow.tenant_custom_domain}`
    : appUrl;
  const publicUrl = `${baseUrl}/c/${certRow.public_id}`;

  // renderCertificatePdf でバイト列を生成（署名セクションなし）
  const pdfBuffer = await renderCertificatePdf(certRow, publicUrl);
  return new Uint8Array(pdfBuffer as ArrayBuffer);
}

/**
 * 署名情報が埋め込まれた証明書 PDF を再生成する。
 *
 * 署名完了後に呼び出し、生成した PDF バイト列を返す。
 * 呼び出し元（sign/[token]/route.ts）で Storage への保存や
 * レスポンスとしての返却を行う。
 *
 * @param certificateId - 証明書 UUID（certificates.id）
 * @param signatureInfo - PDF に埋め込む署名情報
 * @returns 署名情報入り PDF バイト列
 * @throws 証明書が見つからない場合、PDF 生成失敗時
 */
export async function generateSignedPdfBytes(
  certificateId: string,
  signatureInfo:  PdfSignatureSection,
): Promise<Uint8Array> {
  const supabase = getSupabaseAdmin();

  const { data: cert, error } = await supabase
    .from('certificates')
    .select(
      'public_id,customer_name,vehicle_info_json,content_free_text,' +
      'content_preset_json,expiry_type,expiry_value,logo_asset_path,' +
      'created_at,service_type,ppf_coverage_json,coating_products_json,' +
      'warranty_period_end,warranty_exclusions,current_version,' +
      'maintenance_json,body_repair_json,tenant_custom_domain',
    )
    .eq('id', certificateId)
    .single();

  if (error || !cert) {
    throw new Error(`[pdfUtils] Certificate not found: ${certificateId}`);
  }

  // Supabase 生成型と CertRow の差異を unknown 経由で吸収
  const certRow = cert as unknown as CertRow;

  const appUrl = process.env.APP_URL ?? 'https://ledra.co.jp';
  const baseUrl = certRow.tenant_custom_domain
    ? `https://${certRow.tenant_custom_domain}`
    : appUrl;
  const publicUrl = `${baseUrl}/c/${certRow.public_id}`;

  // 署名情報を含む PDF を生成
  const pdfBuffer = await renderCertificatePdf(
    certRow,
    publicUrl,
    signatureInfo,
  );
  return new Uint8Array(pdfBuffer as ArrayBuffer);
}

/**
 * メールアドレスをマスクする。
 *
 * 例: "tanaka@example.com" → "t****@example.com"
 *     "ab@example.com"     → "a****@example.com"
 *
 * @param email - 元のメールアドレス
 * @returns マスク済みメールアドレス
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '****@****';
  const masked = local.charAt(0) + '****';
  return `${masked}@${domain}`;
}
