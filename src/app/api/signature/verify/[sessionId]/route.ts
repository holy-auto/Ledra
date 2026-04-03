/**
 * GET /api/signature/verify/[sessionId]
 *
 * 署名検証 API（公開エンドポイント）。
 * 第三者がいつでも電子署名の正当性を検証できる。
 *
 * 処理フロー:
 * 1. セッションと証明書情報の取得
 * 2. 公開鍵レコードの取得（key_version で一致するものを使用）
 * 3. ECDSA 署名の暗号的検証
 * 4. 'verified' 監査ログの記録
 * 5. 検証結果・署名情報を返す（個人情報はマスク）
 */

import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { apiOk, apiError } from '@/lib/api/response';
import { verifySignature } from '@/lib/signature/crypto';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const { sessionId } = params;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const ua = req.headers.get('user-agent') ?? 'unknown';

  const supabase = getSupabaseAdmin();

  // セッションと関連情報を取得
  const { data: session, error } = await supabase
    .from('signature_sessions')
    .select(`
      id,
      status,
      certificate_id,
      document_hash,
      document_hash_alg,
      signed_at,
      signer_confirmed_email,
      signature,
      signing_payload,
      public_key_fingerprint,
      key_version,
      certificates (
        public_id
      )
    `)
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    return apiError({
      code:    'not_found',
      message: '署名セッションが見つかりません',
      status:  404,
    });
  }

  // 未署名の場合
  if (session.status !== 'signed') {
    return apiOk({
      is_valid:   false,
      status:     session.status,
      message:    session.status === 'pending'
        ? 'この文書はまだ署名されていません'
        : '無効なセッションです',
      verified_at: new Date().toISOString(),
    });
  }

  // 公開鍵の取得（key_version に対応するものを使用）
  const { data: keyRecord } = await supabase
    .from('signature_public_keys')
    .select('public_key, fingerprint')
    .eq('key_version', session.key_version)
    .single();

  if (!keyRecord) {
    return apiError({
      code:    'internal_error',
      message: '検証鍵が見つかりません',
      status:  500,
    });
  }

  // ECDSA 署名の暗号的検証
  const isValid = verifySignature(
    session.signing_payload ?? '',
    session.signature       ?? '',
    keyRecord.public_key,
  );

  // 'verified' 監査ログを記録
  await supabase.from('signature_audit_logs').insert({
    session_id: session.id,
    event:      'verified',
    ip,
    user_agent: ua,
    metadata:   {
      is_valid:    isValid,
      verified_at: new Date().toISOString(),
    },
  });

  const cert = session.certificates as { public_id: string } | null;

  return apiOk({
    is_valid:    isValid,
    status:      session.status,
    message:     isValid
      ? 'この証明書の電子署名は有効です'
      : '署名が無効です。証明書が改ざんされている可能性があります',
    session: {
      id:                     session.id,
      signed_at:              session.signed_at,
      // 個人情報は部分マスク（例: te***@example.com）
      signer_email_masked:    maskEmail(session.signer_confirmed_email),
      document_hash:          session.document_hash,
      document_hash_alg:      session.document_hash_alg,
      public_key_fingerprint: session.public_key_fingerprint,
      key_version:            session.key_version,
    },
    certificate: cert ? { public_id: cert.public_id } : null,
    verified_at: new Date().toISOString(),
  });
}

/**
 * メールアドレスを部分マスクする。
 * 例: "test@example.com" → "te***@example.com"
 */
function maskEmail(email: string | null): string {
  if (!email) return '***';
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return '***';
  const local  = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  const visibleChars = Math.min(2, local.length);
  return local.slice(0, visibleChars) + '***' + domain;
}
