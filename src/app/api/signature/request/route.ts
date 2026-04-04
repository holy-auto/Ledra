/**
 * POST /api/signature/request
 *
 * 署名依頼の作成 API。
 * 施工店（管理画面）から呼び出し、顧客への署名URLを発行する。
 *
 * 処理フロー:
 * 1. 認証チェック
 * 2. 証明書の存在確認（テナント境界チェック）
 * 3. 既存 pending セッションの重複チェック
 * 4. PDF バイト列生成（SHA-256 計算用）
 * 5. 署名セッション作成（ワンタイムURL発行）
 * 6. LINE / メール 通知送信（自動）
 */

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/api/auth';
import { resolveCallerWithRole } from '@/lib/auth/checkRole';
import { apiOk, apiError, apiUnauthorized } from '@/lib/api/response';
import { createSignatureSession, getExistingPendingSession } from '@/lib/signature/session';
import { generateCertificatePdfBytes } from '@/lib/signature/pdfUtils';
import { sendSignatureNotification } from '@/lib/signature/notify';
import type { SignatureRequestBody } from '@/lib/signature/types';

export const dynamic = 'force-dynamic';

const SIGN_BASE_URL = process.env.NEXT_PUBLIC_SIGN_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/sign`
  : 'https://ledra.co.jp/sign';

export async function POST(req: NextRequest) {
  // 1. 認証チェック
  const supabase = await createClient();
  const caller   = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();

  const body: SignatureRequestBody = await req.json();
  const { certificate_id, signer_name, signer_email, signer_phone, notification_method } = body;

  if (!certificate_id) {
    return apiError({
      code:    'validation_error',
      message: 'certificate_id は必須です',
      status:  400,
    });
  }

  // 2. 証明書の存在確認・テナント境界チェック
  // 車両・店舗情報も取得して通知メッセージに使用する
  const { data: cert, error: certError } = await supabase
    .from('certificates')
    .select(`
      id, tenant_id, public_id,
      vehicles(car_number, car_name),
      stores(name)
    `)
    .eq('id', certificate_id)
    .eq('tenant_id', caller.tenantId)
    .single();

  if (certError || !cert) {
    return apiError({
      code:    'not_found',
      message: '証明書が見つからないか、アクセス権がありません',
      status:  404,
    });
  }

  // テナント名（通知文に使用）
  const admin = getAdminClient();
  const { data: tenant } = await admin
    .from('tenants')
    .select('name')
    .eq('id', caller.tenantId)
    .single();

  const storeName = (cert as unknown as { stores?: { name: string } | null }).stores?.name
    ?? tenant?.name
    ?? 'Ledra';

  const vehicle = cert as unknown as {
    vehicles?: { car_number?: string | null; car_name?: string | null } | null;
  };
  const vehicleLabel = [
    vehicle.vehicles?.car_name,
    vehicle.vehicles?.car_number,
  ].filter(Boolean).join(' ') || '未登録';

  // 3. 既存の有効な pending セッションがあれば再利用（重複リクエスト防止）
  const existing = await getExistingPendingSession(certificate_id);
  if (existing) {
    const signUrl = `${SIGN_BASE_URL}/${existing.token}`;

    // 既存セッションでも通知を再送できるよう試行
    if (signer_email || existing.signer_email) {
      void sendSignatureNotification({
        signerEmail:   signer_email ?? existing.signer_email ?? undefined,
        lineUserId:    body.line_user_id ?? undefined,
        signerName:    signer_name ?? existing.signer_name ?? undefined,
        storeName,
        vehicleLabel,
        signUrl,
        expiresAt:     existing.expires_at,
        channel:       (notification_method ?? existing.notification_method ?? 'email') as 'line' | 'email' | 'sms',
        tenantId:      caller.tenantId,
      }).catch((e) => console.warn('[signature/request] re-notify failed', e));
    }

    return apiOk({
      session_id:  existing.id,
      sign_url:    signUrl,
      expires_at:  existing.expires_at,
      is_existing: true,
      notified:    !!(signer_email || existing.signer_email),
      message:     '有効な署名依頼がすでに存在します',
    });
  }

  // 4. PDF バイト列の生成（SHA-256 計算用）
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateCertificatePdfBytes(certificate_id);
  } catch (err) {
    console.error('[signature/request] PDF generation failed:', err);
    return apiError({
      code:    'internal_error',
      message: 'PDF の生成に失敗しました',
      status:  500,
    });
  }

  // 5. 署名セッションの作成
  let session;
  try {
    session = await createSignatureSession({
      certificate_id,
      tenant_id:           caller.tenantId,
      created_by:          caller.userId,
      signer_name:         signer_name,
      signer_email:        signer_email,
      signer_phone:        signer_phone,
      notification_method: notification_method ?? 'email',
      pdf_bytes:           pdfBytes,
    });
  } catch (err) {
    console.error('[signature/request] Session creation failed:', err);
    return apiError({
      code:    'db_error',
      message: '署名セッションの作成に失敗しました',
      status:  500,
    });
  }

  const signUrl = `${SIGN_BASE_URL}/${session.token}`;

  // 6. 通知送信（LINE / メール）
  let notifyResult = { sent: false, channel: 'none', error: 'no recipient' };
  try {
    notifyResult = await sendSignatureNotification({
      signerEmail:  signer_email ?? undefined,
      lineUserId:   body.line_user_id ?? undefined,
      signerName:   signer_name ?? undefined,
      storeName,
      vehicleLabel,
      signUrl,
      expiresAt:    session.expires_at,
      channel:      (notification_method ?? 'email') as 'line' | 'email' | 'sms',
      tenantId:     caller.tenantId,
    });

    // 通知送信日時を記録
    if (notifyResult.sent) {
      await admin
        .from('signature_sessions')
        .update({ notification_sent_at: new Date().toISOString() })
        .eq('id', session.id);
    }
  } catch (e) {
    console.warn('[signature/request] Notification failed (non-fatal):', e);
  }

  return apiOk({
    session_id:       session.id,
    sign_url:         signUrl,
    expires_at:       session.expires_at,
    notified:         notifyResult.sent,
    notified_channel: notifyResult.channel,
  });
}
