import { getAdminClient } from "@/lib/api/auth";

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
  const admin = getAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("line_channel_id, line_channel_secret, line_channel_access_token, line_liff_id, line_enabled")
    .eq("id", tenantId)
    .single();

  if (!tenant?.line_enabled || !tenant.line_channel_access_token) return null;

  return {
    channelId: tenant.line_channel_id,
    channelSecret: tenant.line_channel_secret,
    channelAccessToken: tenant.line_channel_access_token,
    liffId: tenant.line_liff_id || null,
  };
}

/** LINE Messaging API でメッセージを送信 */
async function sendMessage(
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
 * Webhook 署名検証
 * LINE Platform からのリクエストが正規のものか確認
 */
export async function verifySignature(body: string, signature: string, channelSecret: string): Promise<boolean> {
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
  return expected === signature;
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
 * テナント用 Bot が受信したメッセージ/フォローイベントを処理
 */
export async function handleWebhookEvents(
  tenantId: string,
  events: Array<{
    type: string;
    replyToken?: string;
    source?: { userId?: string; type?: string };
    message?: { type: string; text?: string };
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
      const text = event.message.text?.trim().toLowerCase() ?? "";

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
    }
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
