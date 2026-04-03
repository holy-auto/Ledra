/**
 * POST /api/signature/sign/[token]
 *
 * 署名実行 API（電子署名法第2条の中核実装）。
 * 顧客が署名ページで「署名する」ボタンを押したときに呼び出される。
 *
 * 処理フロー:
 * 1. 同意確認・入力バリデーション
 * 2. トークン検証（有効期限・未使用確認）
 * 3. 署名ペイロードの構築（document_hash + signedAt + email + certId + sessionId）
 * 4. ECDSA P-256 署名の実行（電子署名法第2条第2号：非改ざん性）
 * 5. Supabase への署名証跡記録（電子署名法第2条第1号：本人性）
 * 6. 監査ログ記録
 * 7. PDF 再生成（署名情報埋め込み）※非同期
 * 8. 施工店への完了通知 ※非同期
 */

import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { apiOk, apiError } from '@/lib/api/response';
import { getValidSessionByToken } from '@/lib/signature/session';
import { buildSigningPayload }     from '@/lib/signature/hash';
import { signPayload, getPrivateKey, getActiveKeyInfo } from '@/lib/signature/crypto';
import { generateSignedPdfBytes, maskEmail } from '@/lib/signature/pdfUtils';
import type { SignatureSignBody } from '@/lib/signature/types';

export const dynamic = 'force-dynamic';

const VERIFY_BASE_URL = process.env.NEXT_PUBLIC_VERIFY_BASE_URL ?? '/verify';

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const { token } = params;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const ua = req.headers.get('user-agent') ?? 'unknown';

  // 1. リクエストボディのバリデーション
  let body: SignatureSignBody;
  try {
    body = await req.json();
  } catch {
    return apiError({ code: 'validation_error', message: 'リクエストが不正です', status: 400 });
  }

  const { signer_email, agreed } = body;

  // 同意チェック（電子署名法第2条第1号：署名意思の確認）
  if (!agreed) {
    return apiError({
      code:    'validation_error',
      message: '内容に同意してください',
      status:  400,
    });
  }

  // メールアドレスの基本バリデーション
  if (!signer_email || !signer_email.includes('@') || signer_email.length > 254) {
    return apiError({
      code:    'validation_error',
      message: '有効なメールアドレスを入力してください',
      status:  400,
    });
  }

  // 2. セッション検証（有効期限・未使用チェック）
  const session = await getValidSessionByToken(token);
  if (!session) {
    return apiError({
      code:    'not_found',
      message: '署名リンクが無効または有効期限切れです',
      status:  404,
    });
  }

  const supabase   = getSupabaseAdmin();
  const signedAt   = new Date().toISOString();
  const normalizedEmail = signer_email.toLowerCase().trim();

  // 3. 署名ペイロードの構築
  //    この文字列が ECDSA で署名され、改ざん検知の根拠となる
  const signingPayload = buildSigningPayload(
    session.document_hash,
    signedAt,
    normalizedEmail,
    session.certificate_id,
    session.id,
  );

  // 4. ECDSA P-256 署名の実行（電子署名法第2条第2号：非改ざん性）
  let signature: string;
  let keyInfo:   { version: string; fingerprint: string };
  try {
    const privateKey = getPrivateKey();
    signature = signPayload(signingPayload, privateKey);
    keyInfo   = getActiveKeyInfo();
  } catch (err) {
    console.error('[signature/sign] Signing failed:', err);
    return apiError({
      code:    'internal_error',
      message: '署名処理中にエラーが発生しました',
      status:  500,
    });
  }

  // 5. 署名証跡の保存（電子署名法第2条第1号：本人性 + 第2号：非改ざん性）
  //    .eq('status', 'pending') で二重署名を防止
  const { error: updateError } = await supabase
    .from('signature_sessions')
    .update({
      status:                 'signed',
      signed_at:              signedAt,
      signer_ip:              ip,
      signer_user_agent:      ua,
      signer_confirmed_email: normalizedEmail,
      signature,
      signing_payload:        signingPayload,
      public_key_fingerprint: keyInfo.fingerprint,
      key_version:            keyInfo.version,
      updated_at:             new Date().toISOString(),
    })
    .eq('id', session.id)
    .eq('status', 'pending');  // 二重署名防止（楽観的ロック）

  if (updateError) {
    console.error('[signature/sign] DB update failed:', updateError);
    return apiError({
      code:    'db_error',
      message: '署名の保存中にエラーが発生しました',
      status:  500,
    });
  }

  // 6. 監査ログ: 署名完了
  await supabase.from('signature_audit_logs').insert({
    session_id: session.id,
    event:      'signed',
    ip,
    user_agent: ua,
    metadata:   {
      signer_email:           normalizedEmail,
      signed_at:              signedAt,
      key_version:            keyInfo.version,
      public_key_fingerprint: keyInfo.fingerprint,
      document_hash:          session.document_hash,
      // 署名値の先頭32文字のみログに記録（全値は signature_sessions に保存）
      signature_preview:      signature.slice(0, 32) + '...',
    },
  });

  // 7. PDF 再生成（署名情報を埋め込み）— 非同期で実行（レスポンスをブロックしない）
  const verifyBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? '';
  void generateSignedPdfBytes(session.certificate_id, {
    signedAt:             signedAt,
    signerEmailMasked:    maskEmail(normalizedEmail),
    signaturePreview:     signature.slice(0, 20) + '...',
    publicKeyFingerprint: keyInfo.fingerprint,
    verifyUrl:            `${verifyBaseUrl}/verify/${session.id}`,
    documentHash:         session.document_hash,
  }).then(async (pdfBytes) => {
    // 署名済み PDF を Supabase Storage に保存
    const supabaseAsync = getSupabaseAdmin();
    await supabaseAsync.storage
      .from('certificate-pdfs')
      .upload(
        `signed/${session.certificate_id}/${session.id}.pdf`,
        pdfBytes,
        { contentType: 'application/pdf', upsert: true },
      );
  }).catch((err) => {
    // PDF 再生成失敗はログのみ（署名自体は成功しているので致命的エラーにしない）
    console.error('[signature/sign] Signed PDF generation failed:', err);
  });

  // 8. 施工店への完了通知 — 非同期
  // TODO: Phase 4 で通知モジュール実装後に有効化
  // void notifyShopSignatureComplete(session);

  const verifyUrl = `${VERIFY_BASE_URL}/${session.id}`;

  return apiOk({
    success:            true,
    signed_at:          signedAt,
    verify_url:         verifyUrl,
    session_id:         session.id,
    signature_preview:  signature.slice(0, 20) + '...',
  });
}
