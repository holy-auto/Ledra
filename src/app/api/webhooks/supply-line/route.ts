/**
 * Ledra 公式 LINE 公式アカウント (供給パートナー共通チャネル) の webhook。
 *
 * メーカーが受注ポータルで発行した連携コードをこのチャネルに送ると、ここで照合して
 * supply_partners.line_user_id を紐付ける。テナント別チャネル (src/lib/line/client.ts)
 * とは別の、プラットフォーム共通チャネル。
 *
 * 署名は env LEDRA_PARTNER_LINE_CHANNEL_SECRET で検証。未設定なら 404 相当 (無効)。
 */
import { verifySignature, sendMessage } from "@/lib/line/client";
import { tryConsumeSupplyPartnerLineLinkCode } from "@/lib/supply/lineLink";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; text?: string };
};

export async function POST(req: Request) {
  const channelSecret = (process.env.LEDRA_PARTNER_LINE_CHANNEL_SECRET ?? "").trim();
  const accessToken = (process.env.LEDRA_PARTNER_LINE_CHANNEL_ACCESS_TOKEN ?? "").trim();
  if (!channelSecret) {
    // チャネル未設定: 機能無効。
    return new Response("not_configured", { status: 404 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";
  const valid = await verifySignature(raw, signature, channelSecret).catch(() => false);
  if (!valid) return new Response("invalid_signature", { status: 401 });

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(raw)?.events ?? []) as LineEvent[];
  } catch {
    return new Response("ok", { status: 200 }); // 不正 body でも 200 (LINE 再送回避)
  }

  for (const ev of events) {
    const lineUserId = ev.source?.userId;
    if (!lineUserId) continue;

    if (ev.type === "message" && ev.message?.type === "text") {
      try {
        const { linked } = await tryConsumeSupplyPartnerLineLinkCode(lineUserId, ev.message.text ?? "");
        if (linked && accessToken) {
          await sendMessage(accessToken, lineUserId, [
            { type: "text", text: "LINE連携が完了しました。今後、新しい発注をこちらにお知らせします。" },
          ]).catch(() => {});
        }
      } catch (e) {
        logger.warn("[supply-line webhook] consume failed", { err: e instanceof Error ? e.message : String(e) });
      }
    } else if (ev.type === "follow" && accessToken && ev.replyToken) {
      // 友だち追加時の案内 (reply)。
      await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          replyToken: ev.replyToken,
          messages: [
            {
              type: "text",
              text: "友だち追加ありがとうございます。受注ポータルで発行した連携コードを送信すると、発注通知を受け取れます。",
            },
          ],
        }),
      }).catch(() => {});
    }
  }

  return new Response("ok", { status: 200 });
}
