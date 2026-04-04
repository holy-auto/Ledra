/**
 * src/lib/signature/notify.ts
 *
 * 電子署名依頼の通知送信モジュール。
 * LINE / メール / SMS の3チャネルをサポート。
 *
 * 電子署名法第2条第1号（本人性確認の起点）として
 * 署名URLを顧客へ確実に届けることが重要。
 */

import { getLineConfig } from '@/lib/line/client';
import { escapeHtml } from '@/lib/sanitize';

const RESEND_API = 'https://api.resend.com/emails';
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ledra.co.jp';

// ─── 型定義 ────────────────────────────────────────────

export interface SignatureNotifyParams {
  /** 受信者のメールアドレス（email チャネル必須） */
  signerEmail?:    string | null;
  /** 受信者の LINE userId（line チャネル必須） */
  lineUserId?:     string | null;
  /** 受信者の氏名 */
  signerName?:     string | null;
  /** 店舗名 */
  storeName:       string;
  /** 車番/車名 */
  vehicleLabel:    string;
  /** 署名用ワンタイム URL */
  signUrl:         string;
  /** 有効期限（ISO-8601） */
  expiresAt:       string;
  /** 通知チャネル */
  channel:         'line' | 'email' | 'sms';
  /** テナント ID（LINE 設定取得用） */
  tenantId:        string;
}

export interface NotifyResult {
  sent:    boolean;
  channel: string;
  error?:  string;
}

// ─── メール送信 ────────────────────────────────────────

function buildEmailHtml(params: SignatureNotifyParams): string {
  const name        = escapeHtml(params.signerName ?? 'お客様');
  const store       = escapeHtml(params.storeName);
  const vehicle     = escapeHtml(params.vehicleLabel);
  const url         = params.signUrl;
  const expiresDate = new Date(params.expiresAt).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <div style="border-bottom:2px solid #4f46e5;padding-bottom:12px;margin-bottom:20px;">
        <h2 style="margin:0;color:#1d1d1f;font-size:18px;">電子署名のご依頼</h2>
      </div>

      <p style="color:#1d1d1f;font-size:14px;line-height:1.7;">
        ${name} 様<br><br>
        ${store} より施工証明書の電子署名をお願いしております。<br>
        下記のボタンよりご確認・署名をお願いいたします。
      </p>

      <div style="background:#f5f5f7;border-radius:8px;padding:14px;margin:16px 0;font-size:14px;color:#1d1d1f;">
        <strong>対象車両:</strong> ${vehicle}
      </div>

      <div style="margin:24px 0;text-align:center;">
        <a href="${url}"
           style="display:inline-block;background:#4f46e5;color:#fff;padding:14px 32px;
                  border-radius:8px;text-decoration:none;font-size:16px;font-weight:600;">
          ✍️ 署名する
        </a>
      </div>

      <p style="font-size:12px;color:#86868b;line-height:1.6;">
        ※ このリンクは <strong>${expiresDate}</strong> まで有効です。<br>
        ※ 署名は電子署名法に準拠した安全な方式で処理されます。<br>
        ※ 本メールに心当たりがない場合は無視してください。
      </p>

      <div style="border-top:1px solid #e5e5e5;margin-top:24px;padding-top:12px;font-size:12px;color:#86868b;">
        Ledra — 施工管理プラットフォーム
      </div>
    </div>
  `;
}

async function sendEmail(params: SignatureNotifyParams): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    return { sent: false, channel: 'email', error: 'RESEND_API_KEY / RESEND_FROM 未設定' };
  }
  if (!params.signerEmail) {
    return { sent: false, channel: 'email', error: 'signerEmail が未指定' };
  }

  try {
    const res = await fetch(RESEND_API, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to:      params.signerEmail,
        subject: `【${params.storeName}】施工証明書の電子署名をお願いします`,
        html:    buildEmailHtml(params),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { sent: false, channel: 'email', error: `Resend error: ${res.status} ${text}` };
    }
    return { sent: true, channel: 'email' };
  } catch (e) {
    return { sent: false, channel: 'email', error: String(e) };
  }
}

// ─── LINE 送信 ─────────────────────────────────────────

async function sendLine(params: SignatureNotifyParams): Promise<NotifyResult> {
  if (!params.lineUserId) {
    return { sent: false, channel: 'line', error: 'lineUserId が未指定' };
  }

  // テナントの LINE 設定を取得
  const { getLineConfig: _get } = await import('@/lib/line/client');
  const config = await _get(params.tenantId);
  if (!config) {
    // LINE 未設定の場合はメールへフォールバック
    return sendEmail({ ...params, channel: 'email' });
  }

  const expiresDate = new Date(params.expiresAt).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const name    = params.signerName ?? 'お客様';
  const vehicle = params.vehicleLabel;

  // Flex Message（リッチカード）
  const flexMessage = {
    type:       'flex',
    altText:    `【${params.storeName}】施工証明書の電子署名をお願いします`,
    contents: {
      type:   'bubble',
      header: {
        type:   'box',
        layout: 'vertical',
        contents: [{
          type:  'text',
          text:  '✍️ 電子署名のご依頼',
          weight: 'bold',
          size:  'lg',
          color: '#4f46e5',
        }],
        backgroundColor: '#f0f0ff',
        paddingAll:      '16px',
      },
      body: {
        type:    'box',
        layout:  'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: `${name} 様`,
            weight: 'bold',
            size:   'md',
          },
          {
            type: 'text',
            text: `${params.storeName}より施工証明書の署名をお願いしております。`,
            wrap: true,
            size: 'sm',
            color: '#555555',
          },
          {
            type:   'separator',
            margin: 'md',
          },
          {
            type:    'box',
            layout:  'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '対象車両', size: 'xs', color: '#888888', flex: 2 },
              { type: 'text', text: vehicle, size: 'sm', color: '#1d1d1f', flex: 5, wrap: true },
            ],
          },
          {
            type:    'box',
            layout:  'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '有効期限', size: 'xs', color: '#888888', flex: 2 },
              { type: 'text', text: expiresDate, size: 'sm', color: '#1d1d1f', flex: 5 },
            ],
          },
        ],
        paddingAll: '16px',
      },
      footer: {
        type:   'box',
        layout: 'vertical',
        contents: [{
          type:  'button',
          action: {
            type:  'uri',
            label: '署名する',
            uri:   params.signUrl,
          },
          style: 'primary',
          color: '#4f46e5',
        }],
        paddingAll: '12px',
      },
    },
  };

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${config.channelAccessToken}`,
      },
      body: JSON.stringify({
        to:       params.lineUserId,
        messages: [flexMessage],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      // LINE 失敗時はメールへフォールバック
      console.warn('[signature/notify] LINE push failed, fallback to email', text);
      return sendEmail({ ...params, channel: 'email' });
    }
    return { sent: true, channel: 'line' };
  } catch (e) {
    console.warn('[signature/notify] LINE push error, fallback to email', e);
    return sendEmail({ ...params, channel: 'email' });
  }
}

// ─── SMS 送信（Twilio / 簡易実装）──────────────────────

async function sendSms(params: SignatureNotifyParams): Promise<NotifyResult> {
  // SMS は現時点でメールへフォールバック（SMS プロバイダー未設定）
  console.warn('[signature/notify] SMS channel not implemented, fallback to email');
  return sendEmail({ ...params, channel: 'email' });
}

// ─── メイン関数 ────────────────────────────────────────

/**
 * 署名依頼通知を送信する。
 *
 * @param params 通知パラメータ
 * @returns 送信結果（チャネル・成否）
 */
export async function sendSignatureNotification(
  params: SignatureNotifyParams,
): Promise<NotifyResult> {
  switch (params.channel) {
    case 'line':
      return sendLine(params);
    case 'email':
      return sendEmail(params);
    case 'sms':
      return sendSms(params);
    default:
      return sendEmail(params);
  }
}
