/**
 * GET /api/signature/session/[token]
 *
 * 署名ページ表示用のセッション情報取得 API（公開エンドポイント）。
 * 顧客のスマートフォンから署名ページ読み込み時に呼び出される。
 *
 * 処理フロー:
 * 1. トークンでセッションを検索
 * 2. 有効期限チェック（期限切れなら DB 更新）
 * 3. page_opened 監査ログを記録
 * 4. 証明書・車両・店舗情報を返す
 */

import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { apiOk, apiError } from '@/lib/api/response';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const { token } = params;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const ua = req.headers.get('user-agent') ?? 'unknown';

  const supabase = getSupabaseAdmin();

  // セッションと関連情報を取得
  const { data: session, error } = await supabase
    .from('signature_sessions')
    .select(`
      id,
      status,
      expires_at,
      signer_name,
      document_hash,
      certificate_id,
      certificates (
        id,
        public_id,
        created_at,
        cert_type,
        vehicles ( car_number, car_name ),
        stores   ( name )
      )
    `)
    .eq('token', token)
    .single();

  if (error || !session) {
    return apiError({
      code:    'not_found',
      message: '署名リンクが見つかりません',
      status:  404,
    });
  }

  // 期限切れチェック
  if (
    session.status === 'pending' &&
    new Date(session.expires_at) < new Date()
  ) {
    // DB を期限切れに更新
    await supabase
      .from('signature_sessions')
      .update({ status: 'expired' })
      .eq('id', session.id);

    await supabase.from('signature_audit_logs').insert({
      session_id: session.id,
      event:      'expired',
      ip,
      user_agent: ua,
      metadata:   { expired_at: new Date().toISOString() },
    });

    return apiOk({
      status:  'expired',
      message: '署名リンクの有効期限が切れています。施工店に再送を依頼してください。',
    });
  }

  // 署名済み・キャンセル済みの場合
  if (session.status !== 'pending') {
    return apiOk({
      status:  session.status,
      message:
        session.status === 'signed'
          ? 'この署名リンクはすでに使用されています'
          : '無効な署名リンクです',
    });
  }

  // page_opened 監査ログを記録
  await supabase.from('signature_audit_logs').insert({
    session_id: session.id,
    event:      'page_opened',
    ip,
    user_agent: ua,
    metadata:   { opened_at: new Date().toISOString() },
  });

  const cert = session.certificates as {
    id: string;
    public_id: string;
    created_at: string;
    cert_type: string | null;
    vehicles: { car_number: string | null; car_name: string | null } | null;
    stores:   { name: string } | null;
  } | null;

  return apiOk({
    status:     'pending',
    session_id: session.id,
    signer_name: session.signer_name,
    expires_at:  session.expires_at,
    pdf_url:     cert?.public_id
      ? `/api/certificate/pdf?pid=${encodeURIComponent(cert.public_id)}`
      : null,
    certificate: cert,
  });
}
