/**
 * /api/admin/agent-contracts/[id]
 *
 * 個別の代理店署名依頼の取得・操作。
 * Ledra 自前署名エンジン対応版。
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/api/auth';
import { resolveCallerWithRole, requireMinRole } from '@/lib/auth/checkRole';
import {
  apiUnauthorized,
  apiForbidden,
  apiInternalError,
  apiNotFound,
  apiValidationError,
} from '@/lib/api/response';
import { sendSignatureNotification } from '@/lib/signature/notify';

type RouteContext = { params: Promise<{ id: string }> };

const APP_URL         = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ledra.co.jp';
const AGENT_SIGN_BASE = `${APP_URL}/agent-sign`;

/**
 * GET /api/admin/agent-contracts/[id]
 * 署名依頼の詳細を返す。Ledra エンジンの場合は session 情報も含む。
 */
export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, 'admin')) return apiForbidden();

    const admin = getAdminClient();
    const { data, error } = await admin
      .from('agent_signing_requests')
      .select(`
        *,
        signature_sessions(
          id, status, signed_at, expires_at,
          signer_confirmed_email, signer_ip,
          document_hash, signature, public_key_fingerprint
        )
      `)
      .eq('id', id)
      .single();

    if (error || !data) return apiNotFound('contract not found');

    return NextResponse.json({ contract: data });
  } catch (e) {
    return apiInternalError(e, 'admin/agent-contracts [id] GET');
  }
}

/**
 * PUT /api/admin/agent-contracts/[id]
 * 署名依頼の操作。
 * Body: { action: "resend" | "cancel" }
 *
 * resend: 署名URLを再通知（Ledra エンジンは既存の sign_url を再送）
 * cancel: セッションをキャンセル
 */
export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, 'admin')) return apiForbidden();

    const body = await request.json();
    const { action } = body as { action: 'resend' | 'cancel' };
    const admin = getAdminClient();

    const { data: record, error: fetchErr } = await admin
      .from('agent_signing_requests')
      .select('*, agents(name, tenant_id)')
      .eq('id', id)
      .single();

    if (fetchErr || !record) return apiNotFound('contract not found');

    // ── RESEND ──────────────────────────────────────────────────
    if (action === 'resend') {
      if (!['sent', 'viewed'].includes(record.status as string)) {
        return apiValidationError('再送は送信済み/閲覧済みのリクエストのみ可能です');
      }

      const signUrl = record.sign_url as string | null;
      if (!signUrl) {
        return apiValidationError('署名URLが見つかりません。新規に作成し直してください。');
      }

      // セッションの期限確認
      if (record.ledra_session_id) {
        const { data: session } = await admin
          .from('signature_sessions')
          .select('expires_at, status')
          .eq('id', record.ledra_session_id)
          .single();

        if (!session || session.status !== 'pending' || new Date(session.expires_at as string) < new Date()) {
          return apiValidationError('署名セッションが期限切れです。新規に作成し直してください。');
        }
      }

      // テナント名取得
      const agentAny = record.agents as { name?: string; tenant_id?: string } | null;
      const { data: tenant } = await admin
        .from('tenants')
        .select('name')
        .eq('id', agentAny?.tenant_id ?? caller.tenantId)
        .single();

      // メール再送
      let notified = false;
      try {
        const res = await sendSignatureNotification({
          signerEmail:  record.signer_email as string,
          signerName:   record.signer_name as string,
          storeName:    tenant?.name ?? 'Ledra',
          vehicleLabel: record.title as string,
          signUrl,
          expiresAt:    (await admin
            .from('signature_sessions')
            .select('expires_at')
            .eq('id', record.ledra_session_id as string)
            .single()).data?.expires_at as string ?? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          channel:      'email',
          tenantId:     agentAny?.tenant_id ?? caller.tenantId,
        });
        notified = res.sent;
      } catch (e) {
        console.warn('[agent-contracts PUT resend] notification failed:', e);
      }

      const { data: updated } = await admin
        .from('agent_signing_requests')
        .update({
          sent_at:          new Date().toISOString(),
          notified_at:      notified ? new Date().toISOString() : undefined,
          updated_at:       new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      return NextResponse.json({ contract: updated, sign_url: signUrl, notified });
    }

    // ── CANCEL ──────────────────────────────────────────────────
    if (action === 'cancel') {
      if (['signed', 'expired'].includes(record.status as string)) {
        return apiValidationError('署名完了・期限切れのリクエストはキャンセルできません');
      }

      // Ledra セッションもキャンセル
      if (record.ledra_session_id) {
        await admin
          .from('signature_sessions')
          .update({
            status:       'cancelled',
            cancelled_at: new Date().toISOString(),
            cancel_reason: 'admin_cancelled',
            updated_at:   new Date().toISOString(),
          })
          .eq('id', record.ledra_session_id);

        await admin.from('signature_audit_logs').insert({
          session_id: record.ledra_session_id,
          event:      'cancelled',
          metadata:   { reason: 'admin_cancelled', cancelled_by: caller.userId },
        });
      }

      const { data: updated } = await admin
        .from('agent_signing_requests')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      return NextResponse.json({ contract: updated });
    }

    return apiValidationError('invalid action. Must be: resend, cancel');
  } catch (e) {
    return apiInternalError(e, 'admin/agent-contracts [id] PUT');
  }
}
