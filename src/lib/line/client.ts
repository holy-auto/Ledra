import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { readSecret, buildSecretWrite } from "@/lib/crypto/tenantSecrets";
import { issueChannelAccessToken, isLineTokenExpiringSoon } from "./provisioning";
import { logger } from "@/lib/logger";
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

/**
 * トークン失効時刻を単独で読む。列が無い（マイグレーション未適用）環境では
 * null = 「期限なし」を返し、送信経路を絶対に止めない。
 */
async function readTokenExpiry(tenantId: string): Promise<string | null> {
  try {
    const { admin } = createTenantScopedAdmin(tenantId);
    const { data, error } = await admin
      .from("tenants")
      .select("line_channel_token_expires_at")
      .eq("id", tenantId)
      .maybeSingle();
    if (error) return null;
    return (data?.line_channel_token_expires_at as string | null) ?? null;
  } catch {
    // ここは「再発行が要るか」を知るためだけの補助クエリ。何が起きても
    // 送信経路を巻き込まない (throw させない)。
    return null;
  }
}

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

  /**
   * 失効時刻だけ別クエリにする。
   *
   * 上の select に混ぜると、この列のマイグレーション未適用時に select 全体が
   * エラーになり `tenant` が null → getLineConfig が null を返し、**LINE の
   * 送受信が全部無言で止まる**（このリポジトリではマイグレーション未適用の
   * ドリフトが実際に2回起きている）。列が無い環境では「期限なし」として扱い、
   * 従来どおり保存済みトークンをそのまま使う。
   */
  const tokenExpiresAt = await readTokenExpiry(tenantId);

  const channelSecret = await readSecret(tenant.line_channel_secret_ciphertext, "tenants.line_channel_secret");
  let channelAccessToken = await readSecret(
    tenant.line_channel_access_token_ciphertext,
    "tenants.line_channel_access_token",
  );

  if (!channelAccessToken || !channelSecret) return null;

  // Ledra が自動発行したトークンは 30 日で失効する。放置すると予約通知・
  // リマインダー・書類送付が静かに全部止まるため、期限が近ければここで差し替える。
  // 再発行に失敗しても既存トークンはまだ有効なので、送信自体は止めない。
  if (isLineTokenExpiringSoon(tokenExpiresAt)) {
    try {
      const issued = await issueChannelAccessToken(tenant.line_channel_id as string, channelSecret);
      const { ciphertext } = await buildSecretWrite(issued.accessToken);
      const { error } = await admin
        .from("tenants")
        .update({
          line_channel_access_token_ciphertext: ciphertext,
          line_channel_token_expires_at: issued.expiresAt,
        })
        .eq("id", tenantId);
      // 書き込み失敗を握りつぶすと、送信のたびに LINE のトークン発行 API を
      // 叩き続ける状態に無言で入る。必ず記録する。
      if (error) logger.error("line: token refresh saved failed", error, { tenantId });
      channelAccessToken = issued.accessToken;
    } catch (e) {
      logger.error("line: channel access token refresh failed", e, { tenantId });
    }
  }

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
export async function replyMessage(
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
/** テキスト以外のメッセージ種別の受信箱向けプレースホルダ表記 */
const NON_TEXT_MESSAGE_LABELS: Record<string, string> = {
  image: "[画像]",
  video: "[動画]",
  audio: "[音声]",
  sticker: "[スタンプ]",
  location: "[位置情報]",
  file: "[ファイル]",
};

export async function handleWebhookEvents(
  tenantId: string,
  events: Array<{
    type: string;
    replyToken?: string;
    timestamp?: number;
    source?: { userId?: string; type?: string };
    message?: {
      type: string;
      id?: string;
      text?: string;
      stickerId?: string;
      fileName?: string;
      latitude?: number;
      longitude?: number;
      address?: string;
      title?: string;
    };
    postback?: { data?: string; params?: Record<string, string> };
  }>,
): Promise<void> {
  const config = await getLineConfig(tenantId);
  if (!config) return;

  for (const event of events) {
    if (event.type === "follow" && event.source?.userId) {
      // 友だち追加時: ウェルカムメッセージ
      if (event.replyToken) {
        const welcomeText =
          "友だち追加ありがとうございます！\nこのアカウントから予約の確認・リマインダーをお送りします。";
        try {
          await replyMessage(config.channelAccessToken, event.replyToken, [{ type: "text", text: welcomeText }]);
          // 店側の自動返信も受信箱スレッドに残す (顧客のLINEにだけ見えて店側から見えない状態を防ぐ)
          await recordOutboundLineMessage({
            tenantId,
            lineUserId: event.source.userId,
            body: welcomeText,
            delivered: true,
          });
        } catch (e) {
          console.error("[LINE webhook] welcome reply failed:", e);
        }
      }
    }

    // postback アクション。会話フロー (flow:*) のボタンなら分岐処理を試み、処理でき
    // たら受信箱ログ/スタッフ通知はスキップする (フロー側で対応済みのため)。それ以外
    // (リッチメニュー等) は従来どおり受信箱に記録してスタッフが気付けるようにする。
    if (event.type === "postback" && event.source?.userId) {
      const data = event.postback?.data ?? "";
      let flowHandled = false;
      if (data.startsWith("flow:")) {
        try {
          const { handleFlowPostback } = await import("@/lib/ai/automation/conversationFlowPostback");
          flowHandled = await handleFlowPostback({ tenantId, lineUserId: event.source.userId, data });
        } catch {
          flowHandled = false; // fail-soft: 通常の受信箱記録にフォールバック
        }
      }
      if (!flowHandled) {
        const stored = await recordInboundLineMessage({
          tenantId,
          lineUserId: event.source.userId,
          body: `[メニュー操作] ${data}`.trim(),
          rawEvent: event,
          lineTimestampMs: event.timestamp ?? null,
        });
        await maybeNotifyInboundMessage({
          tenantId,
          lineUserId: event.source.userId,
          customerId: stored.customerId ?? null,
        });
      }
    }

    // スタンプ・画像などテキスト以外のメッセージも記録する。
    // 実データを取得できるものは Storage に保存して受信箱で表示/再生できるようにし、
    // 失敗時は attachment なしのプレースホルダのみ (fail-soft)。
    if (event.type === "message" && event.message && event.message.type !== "text" && event.source?.userId) {
      const msg = event.message;
      let attachment: { path: string; contentType: string } | null = null;
      let body = NON_TEXT_MESSAGE_LABELS[msg.type] ?? `[${msg.type}]`;

      let flowHandled = false;
      if (["image", "video", "audio", "file"].includes(msg.type) && msg.id) {
        // content API から実データを取得して保存
        const { fetchAndStoreLineMedia } = await import("@/lib/line/media");
        // 画像は入庫日の車検証撮影フロー (awaiting_vehicle_photo) 中かもしれないため、
        // バイト列も保持しておき OCR にそのまま渡せるようにする (再ダウンロード回避)。
        const isImage = msg.type === "image";
        const fetched = await fetchAndStoreLineMedia({
          tenantId,
          accessToken: config.channelAccessToken,
          messageId: msg.id,
          returnBuffer: isImage,
        });
        attachment = fetched ? { path: fetched.path, contentType: fetched.contentType } : null;
        if (isImage && fetched?.buf) {
          try {
            // 画像バイト列のコピーは 1 回だけ (数 MB になりうるので二重確保しない)。
            const imageBuffer = Buffer.from(fetched.buf);
            const { handleVehiclePhotoMessage } = await import("@/lib/ai/automation/vehicleCaptureAuto");
            flowHandled = await handleVehiclePhotoMessage({
              tenantId,
              lineUserId: event.source.userId,
              imageBuffer,
              attachmentPath: fetched.path,
              attachmentContentType: fetched.contentType,
              lineMessageId: msg.id ?? null,
            });
            // 車両撮影フローでなければ、見積り詳細待ち (awaiting_quote_detail) 中の
            // 車検証写真として OCR → 見積りフロー前進を試みる。
            if (!flowHandled) {
              const { maybeAdvanceQuoteFlowOnPhoto } = await import("@/lib/ai/automation/conversationFlowAuto");
              flowHandled = await maybeAdvanceQuoteFlowOnPhoto({
                tenantId,
                lineUserId: event.source.userId,
                imageBuffer,
                attachmentPath: fetched.path,
                attachmentContentType: fetched.contentType,
                lineMessageId: msg.id ?? null,
              });
            }
          } catch {
            flowHandled = false; // fail-soft: 通常の受信箱記録にフォールバック
          }
        }
        if (msg.type === "file" && msg.fileName) body = `[ファイル] ${msg.fileName}`;
      } else if (msg.type === "sticker" && msg.stickerId) {
        // スタンプは公開 CDN の静止画を保存して表示
        const { fetchAndStoreLineSticker } = await import("@/lib/line/media");
        attachment = await fetchAndStoreLineSticker({ tenantId, stickerId: msg.stickerId });
      } else if (msg.type === "location") {
        // 位置情報は住所 + 地図リンクを本文に展開
        body = [
          `[位置情報]${msg.title ? ` ${msg.title}` : ""}${msg.address ? ` ${msg.address}` : ""}`,
          msg.latitude != null && msg.longitude != null
            ? `https://www.google.com/maps?q=${msg.latitude},${msg.longitude}`
            : null,
        ]
          .filter(Boolean)
          .join("\n");
      }

      if (!flowHandled) {
        const stored = await recordInboundLineMessage({
          tenantId,
          lineUserId: event.source.userId,
          body,
          rawEvent: event,
          lineMessageId: msg.id ?? null,
          lineTimestampMs: event.timestamp ?? null,
          attachmentPath: attachment?.path ?? null,
          attachmentContentType: attachment?.contentType ?? null,
        });
        await maybeNotifyInboundMessage({
          tenantId,
          lineUserId: event.source.userId,
          customerId: stored.customerId ?? null,
        });
      }
    }

    if (event.type === "message" && event.message?.type === "text" && event.source?.userId) {
      const rawText = event.message.text ?? "";

      // 部品確定の連携コードなら customers.line_user_id を紐付けて完了（コードは履歴に残さない）。
      try {
        const { tryConsumeLineLinkCode } = await import("@/lib/line/linkCode");
        // グループ/ルームではマイページ案内をリプライに載せない (参加者全員に届くため)。
        // 載せない場所でトークンだけ発行しても無駄なので、組み立て自体を止める。
        const isDirectTalk = event.source.type === "user";
        const link = await tryConsumeLineLinkCode(tenantId, event.source.userId, rawText, isDirectTalk);
        if (link.linked) {
          if (event.replyToken) {
            // マイページ案内は同じ応答メッセージに同梱する (応答は無料・プッシュは従量課金)。
            // portalText はグループ/ルームでは組み立てられない (上の isDirectTalk)。
            const linkedText = ["LINE連携が完了しました。今後の確認はこちらにお送りします。", link.portalText ?? null]
              .filter(Boolean)
              .join("\n\n");
            await replyMessage(config.channelAccessToken, event.replyToken, [{ type: "text", text: linkedText }]);
            await recordOutboundLineMessage({
              tenantId,
              lineUserId: event.source.userId,
              body: linkedText,
              delivered: true,
            });
          }
          continue;
        }
      } catch (e) {
        console.error("[line.linkCode] consume failed:", e);
      }

      // 顧客発のテキストはすべて inbound として保存 (auto-reply 有無に関わらず)
      const stored = await recordInboundLineMessage({
        tenantId,
        lineUserId: event.source.userId,
        body: rawText,
        rawEvent: event,
        lineMessageId: event.message.id ?? null,
        lineTimestampMs: event.timestamp ?? null,
      });

      // replyToken は 1 イベント 1 回のみ・最大 5 メッセージ。複数の返信は 1 回にまとめて送る。
      // (別々に reply すると 2 通目以降が落ちるため)
      const replyMessages: Array<{ type: string; text?: string; [key: string]: unknown }> = [];

      // human_takeover (「スタッフに相談したい」後 / スタッフ対応中) の間は、決定的な定型返信
      // (予約リンク・連携案内) を**組み立てない** ——「担当が対応します」と伝えた直後に自動返信を
      // 返さないため。判定を組み立ての**前**に置くのは、連携案内 (buildLineLinkPrompt) が招待行を
      // 作る副作用を持つため。組み立て後に抑止すると、抑止された回ごとに未到達の招待が溜まる。
      const { isHumanTakeoverActive } = await import("@/lib/line/flow/flowStore");
      const takeoverActive = await isHumanTakeoverActive(tenantId, {
        customerId: stored.customerId ?? null,
        lineUserId: event.source.userId,
      });

      const text = rawText.trim().toLowerCase();
      // リッチメニューの定型テキスト (来店予約 等) も拾う
      if (!takeoverActive && (text === "予約" || text === "来店予約" || text === "booking")) {
        // LIFF URL で予約画面へ誘導
        const liffUrl = config.liffId ? `https://liff.line.me/${config.liffId}` : null;
        replyMessages.push({
          type: "text",
          text: liffUrl ? `こちらから予約できます:\n${liffUrl}` : "Web予約ページからご予約ください。",
        });
      }

      // 「マイページ」でログインリンクを再発行する (無料のリプライで返す)。
      // ログインリンクは単回使用・期限付きなので、切れた顧客が自分で取り直せる導線が要る。
      // email 無しの顧客にとっては唯一のマイページ入口なので、ここが最後の砦。
      // お客様専用リンクを含むため、1:1 トークかつ紐づけ済みのときだけ。
      if (
        event.source.type === "user" &&
        event.replyToken &&
        stored.customerId &&
        (text === "マイページ" || text === "まいぺーじ" || text === "mypage")
      ) {
        try {
          const { buildPortalWelcomeText } = await import("@/lib/line/linkCustomer");
          const portalText = await buildPortalWelcomeText(tenantId, stored.customerId, event.source.userId);
          if (portalText) replyMessages.push({ type: "text", text: portalText });
        } catch (e) {
          console.error("[line.portalLink] reissue failed:", e);
        }
      }

      // 未紐づけユーザーへの「連携を促す案内」(opt-in テナントのみ / fail-soft)。
      // 課金されるプッシュではなく、この受信メッセージへの**リプライ (無料)** で返す。
      // 招待 URL を含むため、参加者全員に届くグループ/ルームでは送らず、1:1 トークのみ
      // (source.type === "user")。replyToken が無い回はスキップし、次の受信で返す。
      // human_takeover 中は buildLineLinkPrompt を呼ばない (招待行の副作用を避ける)。
      if (!takeoverActive && event.source.type === "user" && event.replyToken) {
        const { buildLineLinkPrompt } = await import("@/lib/line/linkPrompt");
        const prompt = await buildLineLinkPrompt({
          tenantId,
          lineUserId: event.source.userId,
          customerId: stored.customerId ?? null,
        });
        if (prompt) {
          replyMessages.push({ type: "text", text: prompt.text });
        }
      }

      // まとめて 1 回のリプライで送信 (最大 5)。送れた自動返信はすべて受信箱に
      // outbound として残す (連携案内はクールダウン判定にも使われる)。
      if (event.replyToken && replyMessages.length > 0) {
        try {
          const sent = replyMessages.slice(0, 5);
          await replyMessage(config.channelAccessToken, event.replyToken, sent);
          for (const m of sent) {
            if (m.type === "text" && m.text) {
              await recordOutboundLineMessage({
                tenantId,
                lineUserId: event.source.userId,
                body: m.text,
                delivered: true,
              });
            }
          }
        } catch (e) {
          console.error("[LINE webhook] reply failed:", e);
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
        lineUserId: event.source.userId,
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

/**
 * 顧客へテキスト + クイックリプライ (postback ボタン) を LINE Push 送信し、
 * customer_messages に outbound として記録する (本文はボタンラベルを併記)。
 *
 * 会話フロー (line_conversation_flows) の可否・日程選択などボタン駆動の分岐に使う。
 * 失敗しても投げない (fail-soft)。
 */
export async function sendCustomerLineButtons(params: {
  tenantId: string;
  customerId?: string | null;
  lineUserId: string;
  text: string;
  buttons: Array<{ label: string; data: string }>;
  sentByUserId?: string | null;
}): Promise<boolean> {
  const trimmed = params.text.trim();
  if (!trimmed || params.buttons.length === 0) return false;

  // 履歴表示用の本文 (ボタンは受信箱で見えないためラベルを併記)。
  const logBody = `${trimmed}\n[選択肢] ${params.buttons.map((b) => b.label).join(" / ")}`;
  const record = (delivered: boolean, failureReason?: string) =>
    recordOutboundLineMessage({
      tenantId: params.tenantId,
      customerId: params.customerId ?? null,
      lineUserId: params.lineUserId,
      body: logBody,
      sentByUserId: params.sentByUserId ?? null,
      delivered,
      failureReason,
    });

  const config = await getLineConfig(params.tenantId);
  if (!config) {
    await record(false, "LINE integration not configured for this tenant");
    return false;
  }

  // LINE の quickReply は 1 メッセージにつき最大 13 ボタン。postback アクションで送る。
  const quickReply = {
    items: params.buttons.slice(0, 13).map((b) => ({
      type: "action",
      action: { type: "postback", label: b.label.slice(0, 20), data: b.data, displayText: b.label },
    })),
  };

  try {
    await sendMessage(config.channelAccessToken, params.lineUserId, [{ type: "text", text: trimmed, quickReply }]);
    await record(true);
    return true;
  } catch (err) {
    await record(false, err instanceof Error ? err.message : String(err));
    return false;
  }
}

/**
 * 管理画面から顧客へ画像を LINE Push 送信し、customer_messages に outbound
 * (body "[画像]" + attachment) として記録する。
 *
 * 画像は事前に storeOutboundImage で Storage 保存 + 長期署名 URL 発行済みの前提。
 * LINE の image message は JPEG/PNG のみ・https URL 必須 (検証は API 層で行う)。
 */
export async function sendCustomerLineImage(params: {
  tenantId: string;
  customerId?: string | null;
  lineUserId: string;
  imageUrl: string;
  attachmentPath: string;
  attachmentContentType: string;
  sentByUserId?: string | null;
}): Promise<boolean> {
  const config = await getLineConfig(params.tenantId);
  const record = (delivered: boolean, failureReason?: string) =>
    recordOutboundLineMessage({
      tenantId: params.tenantId,
      customerId: params.customerId ?? null,
      lineUserId: params.lineUserId,
      body: "[画像]",
      sentByUserId: params.sentByUserId ?? null,
      attachmentPath: params.attachmentPath,
      attachmentContentType: params.attachmentContentType,
      delivered,
      failureReason: failureReason ?? null,
    });

  if (!config) {
    await record(false, "LINE integration not configured for this tenant");
    return false;
  }

  try {
    // ponytail: preview にも原本 URL を使う (LINE 仕様上プレビューは 1MB 推奨)。
    // 表示が重い場合はサムネイル生成を挟むのが upgrade path。
    await sendMessage(config.channelAccessToken, params.lineUserId, [
      { type: "image", originalContentUrl: params.imageUrl, previewImageUrl: params.imageUrl },
    ]);
    await record(true);
    return true;
  } catch (err) {
    await record(false, err instanceof Error ? err.message : String(err));
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
  /**
   * 帳票 PDF の署名 URL。LINE Messaging API は生ファイル (PDF) を push できないため、
   * URL を本文に含めて顧客が開けるようにする (LINE は本文中の URL を自動リンク化する)。
   */
  pdfUrl?: string;
}): Promise<boolean> {
  const config = await getLineConfig(params.tenantId);
  if (!config) return false;

  const text = [
    `【${params.docType}】${params.docNumber}`,
    `金額: ¥${params.totalAmount.toLocaleString("ja-JP")}`,
    params.message || null,
    params.pdfUrl ? `\nPDFはこちら:\n${params.pdfUrl}` : null,
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

/**
 * 誕生日メッセージを LINE で送信する。
 *
 * cron (follow-up) が birthday_enabled なテナントの該当顧客へ送る。
 * 戻り値 boolean は email フォールバック判定のため
 * (`sendMaintenanceLineMessage` と同じ流儀)。本文は呼び出し側で組み立てる。
 */
export async function sendBirthdayLineMessage(params: {
  tenantId: string;
  lineUserId: string;
  message: string;
}): Promise<boolean> {
  if (!params.lineUserId || !params.message) return false;
  const config = await getLineConfig(params.tenantId);
  if (!config) return false;

  try {
    await sendMessage(config.channelAccessToken, params.lineUserId, [{ type: "text", text: params.message }]);
    return true;
  } catch (err) {
    console.error("[line] sendBirthdayLineMessage failed:", err);
    return false;
  }
}
