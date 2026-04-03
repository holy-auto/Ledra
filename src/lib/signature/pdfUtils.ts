/**
 * Ledra 電子署名 - PDF ユーティリティ
 *
 * 証明書 PDF のバイト列生成と、
 * 署名情報が埋め込まれた PDF の再生成を担当する。
 *
 * 注意: Phase 5 で pdfCertificate.tsx の拡張後に実装を完成させる。
 *       現時点では型定義と骨格のみ提供する。
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

/** PDF に埋め込む署名情報 */
export interface PdfSignatureInfo {
  signedAt:             string;
  signerEmail:          string;       // 表示用（マスク済み）
  signerName?:          string;
  signaturePreview:     string;       // 署名値の省略形（先頭20文字 + "..."）
  publicKeyFingerprint: string;
  verifyUrl:            string;
  documentHash:         string;
}

/**
 * 証明書 PDF のバイト列を生成する。
 *
 * 署名前のハッシュ計算に使用する。
 * 既存の /api/certificate/pdf ルートの実装を参照して実装する。
 *
 * @param certificateId - 証明書 UUID
 * @returns PDF バイト列（Uint8Array）
 * @throws 証明書が見つからない場合、PDF 生成失敗時
 *
 * TODO: Phase 5 で pdfCertificate.tsx の renderToBuffer を使って実装
 */
export async function generateCertificatePdfBytes(
  certificateId: string,
): Promise<Uint8Array> {
  const supabase = getSupabaseAdmin();

  // 証明書の存在確認
  const { data: cert, error } = await supabase
    .from('certificates')
    .select('id, public_id')
    .eq('id', certificateId)
    .single();

  if (error || !cert) {
    throw new Error(`[pdfUtils] Certificate not found: ${certificateId}`);
  }

  // TODO: Phase 5 で実装
  // 既存の /api/certificate/pdf ルートで使用している renderToBuffer を
  // 直接呼び出してバイト列を生成する
  //
  // import { renderToBuffer } from '@react-pdf/renderer';
  // import { PdfCertificate } from '@/lib/pdfCertificate';
  //
  // const pdfBuffer = await renderToBuffer(<PdfCertificate cert={certData} />);
  // return new Uint8Array(pdfBuffer);
  //
  // ── Phase 5 実装まではプレースホルダーとして公開 ID の UTF-8 バイト列を返す ──
  // （実際のハッシュ計算では使用しないこと）
  const placeholder = new TextEncoder().encode(
    `PLACEHOLDER_PDF_${cert.public_id}_TODO_REPLACE_IN_PHASE5`,
  );
  return placeholder;
}

/**
 * 署名情報が埋め込まれた証明書 PDF を再生成する。
 *
 * 署名完了後に呼び出し、Supabase Storage に保存する。
 * 非同期で実行するため、呼び出し元は await せず void で使用すること。
 *
 * @param certificateId - 証明書 UUID
 * @param signatureInfo - 埋め込む署名情報
 *
 * TODO: Phase 5 で pdfCertificate.tsx に ElectronicSignatureSection を追加後に実装
 */
export async function regenerateSignedPdf(
  certificateId: string,
  signatureInfo:  PdfSignatureInfo,
): Promise<void> {
  // TODO: Phase 5 で実装
  // 1. 証明書データを Supabase から取得
  // 2. signatureInfo を含む PdfCertificate コンポーネントで PDF を再生成
  // 3. Supabase Storage の certificates/{certificateId}/signed_certificate.pdf に保存
  console.info(
    `[pdfUtils] regenerateSignedPdf called for ${certificateId} (Phase 5 TODO)`,
    { verifyUrl: signatureInfo.verifyUrl },
  );
}
