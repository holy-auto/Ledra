/**
 * GET /api/cron/signature-maintenance
 *
 * 電子署名セッションのメンテナンス Cron ジョブ（毎時実行推奨）
 *
 * 処理内容:
 * 1. 期限切れ pending セッションを expired に更新
 * 2. 期限24時間前のセッションへリマインダー送信（remind_count < 1 のもの）
 * 3. 期限48時間前のセッションへ早期リマインダー送信（remind_count < 2 のもの ※任意）
 *
 * Vercel cron 設定（vercel.json）に以下を追加してください:
 * {
 *   "path": "/api/cron/signature-maintenance",
 *   "schedule": "0 * * * *"
 * }
 */

import { NextRequest }                         from 'next/server';
import { apiUnauthorized, apiOk, apiInternalError } from '@/lib/api/response';
import { verifyCronRequest }                    from '@/lib/cronAuth';
import { sendCronFailureAlert }                 from '@/lib/cronAlert';
import { getSupabaseAdmin }                     from '@/lib/supabase/admin';
import { sendSignatureNotification }            from '@/lib/signature/notify';
import type { NotificationMethod }              from '@/lib/signature/types';

export const dynamic = 'force-dynamic';

const APP_URL      = process.env.NEXT_PUBLIC_APP_URL   ?? 'https://ledra.co.jp';
const SIGN_BASE    = process.env.NEXT_PUBLIC_SIGN_BASE_URL ?? `${APP_URL}/sign`;

// リマインダー送信のしきい値（時間）
const REMIND_1_HOURS = 24; // 24時間前: 1回目リマインダー
const REMIND_2_HOURS = 48; // 48時間前: 2回目リマインダー（早期）

export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  const admin = getSupabaseAdmin();
  const now   = new Date();

  const results = {
    expired:          0,
    reminded_24h:     0,
    reminded_48h:     0,
    errors:           [] as string[],
  };

  try {
    // ─── 1. 期限切れセッションを expired に更新 ───────────────────
    try {
      const { data: expiredSessions, error } = await admin
        .from('signature_sessions')
        .update({ status: 'expired', updated_at: now.toISOString() })
        .eq('status', 'pending')
        .lt('expires_at', now.toISOString())
        .select('id, certificate_id, tenant_id');

      if (error) {
        results.errors.push(`expire: ${error.message}`);
      } else if (expiredSessions && expiredSessions.length > 0) {
        results.expired = expiredSessions.length;

        // 監査ログに期限切れを記録
        const auditRows = expiredSessions.map((s) => ({
          session_id: s.id,
          event:      'expired',
          metadata:   { expired_at: now.toISOString(), reason: 'cron_maintenance' },
        }));
        await admin.from('signature_audit_logs').insert(auditRows);
      }
    } catch (e) {
      results.errors.push(`expire_catch: ${String(e)}`);
    }

    // ─── 2. 24時間前リマインダー（remind_count = 0） ────────────────
    try {
      const remind24Threshold = new Date(now.getTime() + REMIND_1_HOURS * 60 * 60 * 1000);

      const { data: remind24Sessions, error } = await admin
        .from('signature_sessions')
        .select('id, token, certificate_id, tenant_id, signer_email, signer_name, line_user_id, notification_method, expires_at')
        .eq('status', 'pending')
        .eq('remind_count', 0)
        .gt('expires_at', now.toISOString())             // まだ有効
        .lt('expires_at', remind24Threshold.toISOString()); // 24時間以内に期限

      if (error) {
        results.errors.push(`remind24: ${error.message}`);
      } else if (remind24Sessions && remind24Sessions.length > 0) {
        for (const session of remind24Sessions) {
          try {
            // 車両・店舗情報を取得
            const { data: cert } = await admin
              .from('certificates')
              .select('vehicles(car_number, car_name), stores(name), tenants(name)')
              .eq('id', session.certificate_id)
              .single();

            const certAny = cert as unknown as {
              vehicles?: { car_number?: string | null; car_name?: string | null } | null;
              stores?: { name?: string | null } | null;
              tenants?: { name?: string | null } | null;
            } | null;

            const vehicleLabel = [
              certAny?.vehicles?.car_name,
              certAny?.vehicles?.car_number,
            ].filter(Boolean).join(' ') || '未登録';

            const storeName = certAny?.stores?.name ?? certAny?.tenants?.name ?? 'Ledra';

            await sendSignatureNotification({
              signerEmail:  session.signer_email ?? undefined,
              lineUserId:   session.line_user_id ?? undefined,
              signerName:   session.signer_name ?? undefined,
              storeName,
              vehicleLabel,
              signUrl:      `${SIGN_BASE}/${session.token}`,
              expiresAt:    session.expires_at,
              channel:      (session.notification_method ?? 'email') as NotificationMethod,
              tenantId:     session.tenant_id,
            });

            // remind_count と last_reminded_at を更新
            await admin
              .from('signature_sessions')
              .update({
                remind_count:     1,
                last_reminded_at: now.toISOString(),
                updated_at:       now.toISOString(),
              })
              .eq('id', session.id);

            // 監査ログ記録
            await admin.from('signature_audit_logs').insert({
              session_id: session.id,
              event:      'notification_sent',
              metadata:   { type: 'reminder_24h', sent_at: now.toISOString() },
            });

            results.reminded_24h++;
          } catch (e) {
            results.errors.push(`remind24_session_${session.id}: ${String(e)}`);
          }
        }
      }
    } catch (e) {
      results.errors.push(`remind24_catch: ${String(e)}`);
    }

    // ─── 3. 48時間前リマインダー（remind_count < 1 かつ 24〜48時間後に期限） ─
    // ※ 送信済みのものはスキップ（remind_count >= 1）
    try {
      const remind48High = new Date(now.getTime() + REMIND_2_HOURS * 60 * 60 * 1000);
      const remind24Low  = new Date(now.getTime() + REMIND_1_HOURS * 60 * 60 * 1000);

      const { data: remind48Sessions, error } = await admin
        .from('signature_sessions')
        .select('id, token, certificate_id, tenant_id, signer_email, signer_name, line_user_id, notification_method, expires_at')
        .eq('status', 'pending')
        .eq('remind_count', 0)
        .gt('expires_at', remind24Low.toISOString())  // 24時間超
        .lt('expires_at', remind48High.toISOString()); // 48時間以内

      if (error) {
        results.errors.push(`remind48: ${error.message}`);
      } else if (remind48Sessions && remind48Sessions.length > 0) {
        for (const session of remind48Sessions) {
          try {
            const { data: cert } = await admin
              .from('certificates')
              .select('vehicles(car_number, car_name), stores(name), tenants(name)')
              .eq('id', session.certificate_id)
              .single();

            const certAny = cert as unknown as {
              vehicles?: { car_number?: string | null; car_name?: string | null } | null;
              stores?: { name?: string | null } | null;
              tenants?: { name?: string | null } | null;
            } | null;

            const vehicleLabel = [
              certAny?.vehicles?.car_name,
              certAny?.vehicles?.car_number,
            ].filter(Boolean).join(' ') || '未登録';

            const storeName = certAny?.stores?.name ?? certAny?.tenants?.name ?? 'Ledra';

            await sendSignatureNotification({
              signerEmail:  session.signer_email ?? undefined,
              lineUserId:   session.line_user_id ?? undefined,
              signerName:   session.signer_name ?? undefined,
              storeName,
              vehicleLabel,
              signUrl:      `${SIGN_BASE}/${session.token}`,
              expiresAt:    session.expires_at,
              channel:      (session.notification_method ?? 'email') as NotificationMethod,
              tenantId:     session.tenant_id,
            });

            await admin
              .from('signature_sessions')
              .update({
                remind_count:     1,
                last_reminded_at: now.toISOString(),
                updated_at:       now.toISOString(),
              })
              .eq('id', session.id);

            await admin.from('signature_audit_logs').insert({
              session_id: session.id,
              event:      'notification_sent',
              metadata:   { type: 'reminder_48h', sent_at: now.toISOString() },
            });

            results.reminded_48h++;
          } catch (e) {
            results.errors.push(`remind48_session_${session.id}: ${String(e)}`);
          }
        }
      }
    } catch (e) {
      results.errors.push(`remind48_catch: ${String(e)}`);
    }

    // ─── エラー監視アラート ──────────────────────────────────────────
    if (results.errors.length > 0) {
      await sendCronFailureAlert('signature-maintenance', results.errors.join('; ')).catch(() => {});
    }

    return apiOk({
      ...results,
      run_at: now.toISOString(),
    });
  } catch (e) {
    console.error('[cron/signature-maintenance] Fatal error:', e);
    await sendCronFailureAlert('signature-maintenance', String(e)).catch(() => {});
    return apiInternalError(String(e));
  }
}
