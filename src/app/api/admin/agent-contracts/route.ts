/**
 * /api/admin/agent-contracts
 *
 * 代理店への契約書・NDA 署名依頼 API。
 * CloudSign を廃止し、Ledra 自前 ECDSA 署名エンジンへ完全移行。
 *
 * POST フロー:
 *   1. 管理者認証
 *   2. 代理店の存在確認
 *   3. リクエストボディから PDF バイト列を取得
 *      - pdf_storage_path が指定された場合 → agent-shared-files バケットから取得
 *      - それ以外 → 契約書タイトルのみ含むプレースホルダー PDF を使用
 *   4. signature_session 作成（ワンタイムURL発行）
 *   5. agent_signing_requests レコード作成
 *   6. メール通知送信
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/api/auth';
import { resolveCallerWithRole, requireMinRole } from '@/lib/auth/checkRole';
import {
  apiUnauthorized,
  apiForbidden,
  apiInternalError,
  apiValidationError,
} from '@/lib/api/response';
import { createSignatureSession, getExistingPendingSession } from '@/lib/signature/session';
import { sendSignatureNotification } from '@/lib/signature/notify';

export const dynamic = 'force-dynamic';

const APP_URL       = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ledra.co.jp';
const AGENT_SIGN_BASE = `${APP_URL}/agent-sign`;

// プレースホルダーPDFを生成（Phase として実際のPDF生成に差し替え可能）
function buildPlaceholderPdf(title: string, agentName: string): Uint8Array {
  const text = `AGENT_CONTRACT_PLACEHOLDER|title=${title}|agent=${agentName}`;
  return new TextEncoder().encode(text);
}

/**
 * GET /api/admin/agent-contracts?agent_id=xxx
 * 指定代理店の署名依頼一覧を返す。
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, 'admin')) return apiForbidden();

    const agentId = request.nextUrl.searchParams.get('agent_id');
    if (!agentId) return apiValidationError('agent_id is required');

    const admin = getAdminClient();
    const { data, error } = await admin
      .from('agent_signing_requests')
      .select('*, signature_sessions(status, signed_at, expires_at, signer_confirmed_email)')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // sign_url がない古いレコードは cloudsign_document_id の有無でエンジンを判定
    const enriched = (data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      // Ledra 署名エンジンのセッション情報をフラットに展開
      ledra_status: (row.signature_sessions as Record<string, unknown> | null)?.status ?? null,
      ledra_signed_at: (row.signature_sessions as Record<string, unknown> | null)?.signed_at ?? null,
    }));

    return NextResponse.json({ contracts: enriched });
  } catch (e) {
    return apiInternalError(e, 'admin/agent-contracts GET');
  }
}

/**
 * POST /api/admin/agent-contracts
 * 新規署名依頼を Ledra 自前署名で作成・送信する。
 *
 * Body:
 *   agent_id        string  必須
 *   template_type   string  必須 ('agent_contract' | 'nda' | 'other')
 *   title           string  必須
 *   signer_email    string  必須
 *   signer_name     string  必須
 *   pdf_storage_path string? agent-shared-files バケット内のパス（任意）
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, 'admin')) return apiForbidden();

    const body = await request.json();
    const {
      agent_id,
      template_type,
      title,
      signer_email,
      signer_name,
      pdf_storage_path,
    } = body as {
      agent_id: string;
      template_type: string;
      title: string;
      signer_email: string;
      signer_name: string;
      pdf_storage_path?: string;
    };

    if (!agent_id)      return apiValidationError('agent_id は必須です');
    if (!template_type) return apiValidationError('template_type は必須です');
    if (!title?.trim()) return apiValidationError('title は必須です');
    if (!signer_email?.trim()) return apiValidationError('signer_email は必須です');
    if (!signer_name?.trim())  return apiValidationError('signer_name は必須です');

    const admin = getAdminClient();

    // 代理店の存在確認 + テナント名取得
    const { data: agent, error: agentErr } = await admin
      .from('agents')
      .select('id, name, tenant_id')
      .eq('id', agent_id)
      .single();
    if (agentErr || !agent) return apiValidationError('代理店が見つかりません');

    // テナント名（通知文に使用）
    const { data: tenant } = await admin
      .from('tenants')
      .select('name')
      .eq('id', agent.tenant_id ?? caller.tenantId)
      .single();
    const storeName = tenant?.name ?? 'Ledra';

    // ── 重複チェック（同じ代理店×タイトルの pending セッション）──
    const { data: existingReq } = await admin
      .from('agent_signing_requests')
      .select('id, sign_url, ledra_session_id, status, created_at')
      .eq('agent_id', agent_id)
      .eq('title', title.trim())
      .eq('status', 'sent')
      .maybeSingle();

    if (existingReq?.sign_url) {
      return NextResponse.json({
        contract: existingReq,
        sign_url: existingReq.sign_url,
        is_existing: true,
        message: '同タイトルの有効な署名依頼がすでに存在します',
      });
    }

    // ── PDF バイト列の準備 ──────────────────────────────────────
    let pdfBytes: Uint8Array;

    if (pdf_storage_path) {
      // Supabase Storage から取得
      const { data: fileData, error: dlErr } = await admin.storage
        .from('agent-shared-files')
        .download(pdf_storage_path);

      if (dlErr || !fileData) {
        return apiValidationError('指定された PDF ファイルが見つかりません');
      }
      pdfBytes = new Uint8Array(await fileData.arrayBuffer());
    } else {
      // プレースホルダー PDF（後で実PDFに差し替え可能）
      pdfBytes = buildPlaceholderPdf(title.trim(), agent.name);
    }

    // ── Ledra 署名セッション作成 ────────────────────────────────
    // certificate_id の代わりに agent_id を使う特殊セッション
    // NOTE: signature_sessions.certificate_id は certificates テーブルへの FK だが、
    //       代理店契約書には certificate が存在しない。
    //       そのため、certificate_id に Ledra のシステム用 UUID をセットする代わりに、
    //       agent_signing_requests レコードを先に仮作成して certificate_id を紐付ける。
    //
    //       実装方針: agent_signing_requests を先に draft で作成 →
    //                 signature_sessions の certificate_id には
    //                 ダミーとして NULL 許容のカラムを追加（別マイグレーション）する
    //                 or session.ts を直接呼ばず admin client で直接 insert する。
    //
    //       ここでは session.ts を直接使わず admin で直接 insert する。

    // SHA-256 ハッシュ計算
    const hashBuffer = await crypto.subtle.digest('SHA-256', pdfBytes);
    const hashArray  = Array.from(new Uint8Array(hashBuffer));
    const docHash    = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    // トークン生成
    const token     = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const { data: session, error: sessionErr } = await admin
      .from('signature_sessions')
      .insert({
        // certificate_id は NOT NULL FK のため、agent_signing_requests 側で管理し
        // ここでは NULL を許容するよう移行済み（マイグレーション済み前提）
        // 暫定: ダミー証明書 ID をセットしない → certificate_id カラムを nullable に
        // するマイグレーションが必要。一時的に空を避けるため agent_id を文字列で保存。
        // ※ 後続マイグレーション 20260404200000 で certificate_id を nullable にする
        tenant_id:           agent.tenant_id ?? caller.tenantId,
        token,
        expires_at:          expiresAt,
        status:              'pending',
        document_hash:       docHash,
        document_hash_alg:   'SHA-256',
        signer_name:         signer_name.trim(),
        signer_email:        signer_email.trim(),
        notification_method: 'email',
        created_by:          caller.userId,
      })
      .select('id, token, expires_at')
      .single();

    if (sessionErr || !session) {
      console.error('[agent-contracts POST] session insert failed:', sessionErr);
      // certificate_id NOT NULL 制約エラーの場合は別途マイグレーションが必要
      return apiInternalError(sessionErr ?? 'session insert failed', 'agent-contracts POST session');
    }

    const signUrl = `${AGENT_SIGN_BASE}/${session.token}`;

    // ── agent_signing_requests レコード作成 ────────────────────
    const { data: record, error: insertErr } = await admin
      .from('agent_signing_requests')
      .insert({
        agent_id,
        template_type,
        title:             title.trim(),
        status:            'sent',
        signer_email:      signer_email.trim(),
        signer_name:       signer_name.trim(),
        sent_at:           new Date().toISOString(),
        requested_by:      caller.userId,
        // Ledra 署名エンジン
        sign_engine:       'ledra',
        ledra_session_id:  session.id,
        sign_url:          signUrl,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // 監査ログ
    await admin.from('signature_audit_logs').insert({
      session_id: session.id,
      event:      'session_created',
      metadata:   {
        context:       'agent_contract',
        agent_id,
        template_type,
        title:         title.trim(),
        created_by:    caller.userId,
      },
    });

    // ── 通知メール送信 ──────────────────────────────────────────
    let notified = false;
    try {
      const result = await sendSignatureNotification({
        signerEmail:  signer_email.trim(),
        signerName:   signer_name.trim(),
        storeName,
        vehicleLabel: title.trim(),   // 代理店契約書ではタイトルを使用
        signUrl,
        expiresAt,
        channel:      'email',
        tenantId:     agent.tenant_id ?? caller.tenantId,
      });
      notified = result.sent;

      if (notified) {
        await admin
          .from('agent_signing_requests')
          .update({ notified_at: new Date().toISOString(), notified_channel: 'email' })
          .eq('id', record.id);
        await admin
          .from('signature_sessions')
          .update({ notification_sent_at: new Date().toISOString() })
          .eq('id', session.id);
      }
    } catch (e) {
      console.warn('[agent-contracts POST] notification failed (non-fatal):', e);
    }

    return NextResponse.json(
      {
        contract: record,
        sign_url:         signUrl,
        expires_at:       expiresAt,
        notified,
        sign_engine:      'ledra',
      },
      { status: 201 },
    );
  } catch (e) {
    return apiInternalError(e, 'admin/agent-contracts POST');
  }
}
