import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { readSecret } from "@/lib/crypto/tenantSecrets";
import { recordInboundLineMessage, recordOutboundLineMessage } from "./messageStore";
import { maybeAutoProcessInboundMessage } from "@/lib/ai/automation/inboundAuto";
import { maybeNotifyInboundMessage } from "./inboundNotify";

/**
 * LINE Messaging API クライアント
 *
 * テナントごとに LINE Channel 設定を保持。
 * 環境変数ではなく DB から設定を取得する（マルチテナント対応）。
 */

type LineConfig = {
  channelId: string;
  channelSecret: string;
  channelAccessToken: string;
  liffId: string | null;
};

/** テナントの LINE 設定を取得 */
async function getLineConfig(tenantId: string): Promise<LineConfig | null> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data: tenant } = await admin
    .from("tenants")
    .select(
      "line_channel_id, line_channel_secret_ciphertext, line_channel_access_token_ciphertext, line_liff_id, line_enabled",
    )
    .eq("id", tenantId)
    .single();

  if (!tenant?.line_enabled) return null;

  const channelSecret = await readSecret(tenant.line_channel_secret_ciphertext, "tenants.line_channel_secret");
  const channelAccessToken = await readSecret(
    tenant.line_channel_access_token_ciphertext,
    "tenants.line_channel_access_token",
  );

  if (!channelAccessToken || !channelSecret) return null;

  return {
    channelId: tenant.line_channel_id,
    channelSecret,
    channelAccessToken,
    liffId: tenant.line_liff_id || null,
  };
}

/**
 * LINE Messaging API でメッセージを送信。
 *
 * 5xx / 4xx 失敗時は `throw` する。clientWithRetry の retry 機構から再利用するため
 * named export している。通常の呼び出し元 (sendBookingConfirmation 等) は throw を
 * そのまま顧客向け fail-soft で扱う (try/catch で握りつぶし)。retry + SMS fallback
 * が必要な重要通知は `clientWithRetry.ts` 経由で呼ぶこと。
 */
export async function sendMessage(
  accessToken: string,
  to: string,
  messages: Array<{ type: string; text?: string; [key: string]: unknown }>,
): Promise<void> {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to, messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE API error: ${res.status} ${body}`);
  }
}

/** LINE Messaging API でリプライ送信 */
async function replyMessage(
  accessToken: string,
  replyToken: string,
  messages: Array<{ type: string; text?: string; [key: string]: unknown }>,
): Promise<void> {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE reply error: ${res.status} ${body}`);
  }
}

/**
 * 文字列を timing-safe に比較する。
 * 長さが異なる場合は早期 false だが、長さ一致時は全文字を走査するため
 * バイト単位の差異がレスポンス時間に漏れない。
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Webhook 署名検証
 * LINE Platform からのリクエストが正規のものか確認
 */
export async function verifySignature(body: string, signature: string, channelSecret: string): Promise<boolean> {
  if (typeof signature !== "string" || signature.length === 0) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return timingSafeStringEqual(expected, signature);
}

/** 予約確認メッセージを送信 */
export async function sendBookingConfirmation(
  tenantId: string,
  lineUserId: string,
  booking: {
    title: string;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    tenant_name: string;
  },
): Promise<void> {
  const config = await getLineConfig(tenantId);
  if (!config) return;

  await sendMessage(config.channelAccessToken, lineUserId, [
    {
      type: "text",
      text: [
        `【予約確認】${booking.tenant_name}`,
        ``,
        `📅 ${booking.scheduled_date}`,
        `🕐 ${booking.start_time} 〜 ${booking.end_time}`,
        `📝 ${booking.title}`,
        ``,
        `ご予約ありがとうございます。`,
        `キャンセル・変更はお店に直接ご連絡ください。`,
      ].join("\n"),
    },
  ]);
}

/** 予約リマインダーを送信 */
export async function sendBookingReminder(
  tenantId: string,
  lineUserId: string,
  booking: {
    title: string;
    scheduled_date: string;
    start_time: string;
    tenant_name: string;
  },
): Promise<void> {
  const config = await getLineConfig(tenantId);
  if (!config) return;

  await sendMessage(config.channelAccessToken, lineUserId, [
    {
      type: "text",
      text: [
        `【リマインダー】${booking.tenant_name}`,
        ``,
        `明日のご予約をお知らせします。`,
        `📅 ${booking.scheduled_date}`,
        `🕐 ${booking.start_time}〜`,
        `📝 ${booking.title}`,
        ``,
        `お気をつけてお越しください。`,
      ].join("\n"),
    },
  ]);
}

/** 予約キャンセル通知を送信 */
export async function sendBookingCancellation(
  tenantId: string,
  lineUserId: string,
  booking: {
    title: string;
    scheduled_date: string;
    tenant_name: string;
    reason?: string;
  },
): Promise<void> {
  const config = await getLineConfig(tenantId);
  if (!config) return;

  await sendMessage(config.channelAccessToken, lineUserId, [
    {
      type: "text",
      text: [
        `【予約キャンセル】${booking.tenant_name}`,
        ``,
        `📅 ${booking.scheduled_date}`,
        `📝 ${booking.title}`,
        booking.reason ? `理由: ${booking.reason}` : null,
        ``,
        `予約がキャンセルされました。`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ]);
}

/**
 * LINE Webhook イベント処理
 * テナント用 Bot が受信したメッセージ/フォローイベントを処理。
 *
 * 顧客発のテキストメッセージは customer_messages に inbound として記録する
 * (auto-reply の有無に関わらず常に記録)。失敗してもメイン処理は止めない。
 */
export async function handleWebhookEvents(
  tenantId: string,
  events: Array<{
    type: string;
    replyToken?: string;
    timestamp?: number;
    source?: { userId?: string; type?: string };
    message?: { type: string; id?: string; text?: string };
  }>,
): Promise<void> {
  const config = await getLineConfig(tenantId);
  if (!config) return;

  for (const event of events) {
    if (event.type === "follow" && event.source?.userId) {
      // 友だち追加時: ウェルカムメッセージ
      if (event.replyToken) {
        await replyMessage(config.channelAccessToken, event.replyToken, [
          {
            type: "text",
            text: "友だち追加ありがとうございます！\nこのアカウントから予約の確認・リマインダーをお送りします。",
          },
        ]);
      }
    }

    if (event.type === "message" && event.message?.type === "text" && event.source?.userId) {
      const rawText = event.message.text ?? "";

      // 顧客発のテキストはすべて inbound として保存 (auto-reply 有無に関わらず)
      const stored = await recordInboundLineMessage({
        tenantId,
        lineUserId: event.source.userId,
        body: rawText,
        rawEvent: event,
        lineMessageId: event.message.id ?? null,
        lineTimestampMs: event.timestamp ?? null,
      });

      const text = rawText.trim().toLowerCase();
      if (text === "予約" || text === "booking") {
        // LIFF URL で予約画面へ誘導
        const liffUrl = config.liffId ? `https://liff.line.me/${config.liffId}` : null;

        if (event.replyToken) {
          await replyMessage(config.channelAccessToken, event.replyToken, [
            {
              type: "text",
              text: liffUrl ? `こちらから予約できます:\n${liffUrl}` : "Web予約ページからご予約ください。",
            },
          ]);
        }
      }

      // スタッフ向け in-app 通知 (クールダウン付き / fail-soft)。受信箱で気付けるように。
      await maybeNotifyInboundMessage({
        tenantId,
        lineUserId: event.source.userId,
        customerId: stored.customerId ?? null,
      });

      // AI 自動処理 (auto_extract が opt-in のテナントのみ実体が動く / 既定 OFF)。
      // 顧客向け返信を遅らせないよう最後に実行。内部で fail-soft (throw しない)。
      await maybeAutoProcessInboundMessage({
        tenantId,
        messageId: stored.id ?? null,
        customerId: stored.customerId ?? null,
        text: rawText,
        channel: "line",
        receivedDate: event.timestamp ? new Date(event.timestamp).toISOString().slice(0, 10) : undefined,
      });
    }
  }
}

/**
 * 管理画面から顧客へ任意テキストを LINE Push 送信し、customer_messages に
 * outbound として記録する。テナント側で line_enabled かつ access token が
 * 設定されている前提。
 *
 * @returns 成功時 true、設定欠如や API エラーで false。どちらの場合も
 *          履歴は customer_messages に残る (失敗時は failed_at + reason)。
 */
export async function sendCustomerLineText(params: {
  tenantId: string;
  customerId?: string | null;
  lineUserId: string;
  body: string;
  sentByUserId?: string | null;
}): Promise<boolean> {
  const trimmed = params.body.trim();
  if (!trimmed) return false;

  const config = await getLineConfig(params.tenantId);
  if (!config) {
    await recordOutboundLineMessage({
      tenantId: params.tenantId,
      customerId: params.customerId ?? null,
      lineUserId: params.lineUserId,
      body: trimmed,
      sentByUserId: params.sentByUserId ?? null,
      delivered: false,
      failureReason: "LINE integration not configured for this tenant",
    });
    return false;
  }

  try {
    await sendMessage(config.channelAccessToken, params.lineUserId, [{ type: "text", text: trimmed }]);
    await recordOutboundLineMessage({
      tenantId: params.tenantId,
      customerId: params.customerId ?? null,
      lineUserId: params.lineUserId,
      body: trimmed,
      sentByUserId: params.sentByUserId ?? null,
      delivered: true,
    });
    return true;
  } catch (err) {
    await recordOutboundLineMessage({
      tenantId: params.tenantId,
      customerId: params.customerId ?? null,
      lineUserId: params.lineUserId,
      body: trimmed,
      sentByUserId: params.sentByUserId ?? null,
      delivered: false,
      failureReason: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** 帳票リンクをLINEで送信 */
export async function sendDocumentLink(params: {
  tenantId: string;
  lineUserId: string;
  docType: string;
  docNumber: string;
  totalAmount: number;
  message?: string;
}): Promise<boolean> {
  const config = await getLineConfig(params.tenantId);
  if (!config) return false;

  const text = [
    `【${params.docType}】${params.docNumber}`,
    `金額: ¥${params.totalAmount.toLocaleString("ja-JP")}`,
    params.message || null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await sendMessage(config.channelAccessToken, params.lineUserId, [{ type: "text", text }]);
    return true;
  } catch {
    return false;
  }
}

/**
 * 施工進捗通知をLINEで送信（顧客向け）
 * is_customer_visible なステップ完了時に呼び出す
 */
export async function sendProgressUpdate(params: {
  tenantId: string;
  lineUserId: string;
  customerName: string;
  tenantName: string;
  stepLabel: string;
  progressPct: number;
  currentStep: number;
  totalSteps: number;
  estimatedCompletionTime?: string;
  portalUrl: string;
}): Promise<boolean> {
  const config = await getLineConfig(params.tenantId);
  if (!config) return false;

  // 進捗バー生成 (■□ 形式、10マス)
  const filled = Math.round(params.progressPct / 10);
  const bar = "■".repeat(filled) + "□".repeat(10 - filled);

  const lines: string[] = [
    `【施工進捗】${params.tenantName}`,
    ``,
    `${params.customerName} 様`,
    ``,
    `${bar} ${params.progressPct}%`,
    `現在の工程: ${params.stepLabel}`,
  ];

  if (params.estimatedCompletionTime) {
    lines.push(`完了予定: ${params.estimatedCompletionTime}`);
  }

  if (params.progressPct >= 100) {
    lines.push(``, `✅ 施工が完了しました！`, `お待ちしております。`);
  }

  const text = lines.join("\n");

  // Flex Message でリッチな見た目（ポータルリンク付き）
  const flexMessage = {
    type: "flex",
    altText: `施工進捗 ${params.progressPct}% - ${params.stepLabel}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "施工進捗のお知らせ",
            weight: "bold",
            size: "sm",
            color: "#FFFFFF",
          },
        ],
        backgroundColor: "#1a1a2e",
        paddingAll: "16px",
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: `${params.customerName} 様`,
            size: "sm",
            color: "#555555",
          },
          {
            type: "text",
            text: params.stepLabel,
            weight: "bold",
            size: "xl",
            color: "#1a1a2e",
            wrap: true,
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "box",
                layout: "vertical",
                contents: [
                  {
                    type: "filler",
                  },
                ],
                width: `${params.progressPct}%`,
                height: "8px",
                backgroundColor: "#4f46e5",
                cornerRadius: "4px",
              },
            ],
            backgroundColor: "#e5e7eb",
            height: "8px",
            cornerRadius: "4px",
          },
          {
            type: "text",
            text: `${params.progressPct}%`,
            size: "sm",
            color: "#4f46e5",
            weight: "bold",
            align: "end",
          },
          ...(params.estimatedCompletionTime
            ? [
                {
                  type: "text" as const,
                  text: `完了予定: ${params.estimatedCompletionTime}`,
                  size: "xs",
                  color: "#888888",
                },
              ]
            : []),
        ],
        paddingAll: "16px",
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            action: {
              type: "uri",
              label: "詳細を見る",
              uri: params.portalUrl,
            },
            style: "primary",
            color: "#4f46e5",
            height: "sm",
          },
        ],
        paddingAll: "12px",
      },
    },
  };

  try {
    await sendMessage(config.channelAccessToken, params.lineUserId, [flexMessage]);
    return true;
  } catch {
    // LINE通知失敗はサイレントに無視（メイン処理を止めない）
    return false;
  }
}

export { getLineConfig };

/**
 * メンテナンスリマインダーを LINE で送信する。
 *
 * 戻り値が boolean なのは、cron が email へフォールバックできるようにするため。
 * - LINE 設定が未構成 (`getLineConfig` が null) → false (失敗扱い)
 * - send で例外 → false
 * 例外を握りつぶす点は `sendDocumentLink` と同じ流儀。
 *
 * `lineMessage` には改行込みのプレーンテキストを想定 (絵文字 OK)。Flex Message
 * は使わない: LINE の仕様で長文を 1 通で確実に届かせるには text type が一番
 * 安定で、AI 生成のトーンを邪魔しない。
 */
export async function sendMaintenanceLineMessage(params: {
  tenantId: string;
  lineUserId: string;
  lineMessage: string;
}): Promise<boolean> {
  if (!params.lineUserId || !params.lineMessage) return false;
  const config = await getLineConfig(params.tenantId);
  if (!config) return false;

  try {
    await sendMessage(config.channelAccessToken, params.lineUserId, [{ type: "text", text: params.lineMessage }]);
    return true;
  } catch (err) {
    console.error("[line] sendMaintenanceLineMessage failed:", err);
    return false;
  }
}
