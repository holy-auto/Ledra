/**
 * 未紐づけの LINE ユーザーに「顧客連携」を促す案内の送信判定 + 送信。
 *
 * LINE 公式アカウントは店から先に送れず必ず顧客発でやり取りが始まるため、
 * 会話が少し進んだ段階で 1 度だけ案内を送り、
 *   - 既存のお客様 → 連携コードをこのトークンに送信
 *   - はじめての方  → 登録フォーム (intake) で個人情報登録 → 完了時に自動連携
 * の 2 経路へ誘導する。
 *
 * webhook から fire-and-forget で呼ばれる前提で、絶対に throw しない。
 * テナントが `line_link_prompt_enabled` を opt-in した場合のみ実体が動く。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getLineConfig, sendMessage } from "@/lib/line/client";
import { recordOutboundLineMessage } from "@/lib/line/messageStore";
import { createIntakeInvitation } from "@/lib/identity/intakeServer";

/** 案内メッセージ冒頭の識別マーカー (再送クールダウン判定に使う)。 */
const PROMPT_MARKER = "【LINE連携のお願い】";
/** 何件くらいやり取りが進んだら案内するか (いきなり初回では送らない)。 */
const PROMPT_AFTER_INBOUND = Number(process.env.LINE_LINK_PROMPT_AFTER_INBOUND) || 2;
/** 同一ユーザーへの再送を抑止する日数。 */
const PROMPT_COOLDOWN_DAYS = Number(process.env.LINE_LINK_PROMPT_COOLDOWN_DAYS) || 7;

function getBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? null;
  if (!url) return null;
  return url.startsWith("http") ? url : `https://${url}`;
}

export interface MaybePromptLineLinkParams {
  tenantId: string;
  lineUserId: string;
  /** 受信メッセージ処理時点で解決済みの顧客 ID。非 null なら既に紐づき済みなので案内しない。 */
  customerId: string | null;
}

/**
 * 条件を満たせば連携案内を 1 度だけ送る。失敗しても投げない。
 */
export async function maybePromptLineLink(params: MaybePromptLineLinkParams): Promise<void> {
  const { tenantId, lineUserId, customerId } = params;
  try {
    if (customerId) return; // 既に紐づき済み

    const admin = createServiceRoleAdmin("LINE 連携案内 — 未紐づけユーザーへの誘導 (webhook は auth 無し)");

    // テナントが案内を opt-in しているか。
    const { data: tenant } = await admin.from("tenants").select("line_link_prompt_enabled").eq("id", tenantId).single();
    if (!tenant?.line_link_prompt_enabled) return;

    // やり取りが一定数進んでから案内する (いきなり初回では送らない)。
    const { count: inboundCount } = await admin
      .from("customer_messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("line_user_id", lineUserId)
      .eq("direction", "inbound");
    if ((inboundCount ?? 0) < PROMPT_AFTER_INBOUND) return;

    // クールダウン: 直近に同一ユーザーへ案内済みなら再送しない。
    const sinceIso = new Date(Date.now() - PROMPT_COOLDOWN_DAYS * 24 * 3600 * 1000).toISOString();
    const { count: promptCount } = await admin
      .from("customer_messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("line_user_id", lineUserId)
      .eq("direction", "outbound")
      .ilike("body", `${PROMPT_MARKER}%`)
      .gte("created_at", sinceIso);
    if ((promptCount ?? 0) > 0) return;

    const config = await getLineConfig(tenantId);
    if (!config) return;

    // 新規のお客様向けに登録フォーム (intake) を 1 件発行し、URL を案内に含める。
    let intakeUrl: string | null = null;
    const baseUrl = getBaseUrl();
    if (baseUrl) {
      try {
        const invite = await createIntakeInvitation({
          tenantId,
          createdBy: null,
          baseUrl,
          lineUserId,
          label: "LINE 連携からの新規登録",
        });
        intakeUrl = invite.url;
      } catch (e) {
        logger.warn("[linkPrompt] intake invite create failed", {
          tenantId,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const lines = [
      PROMPT_MARKER,
      "ご連絡ありがとうございます。スムーズにご案内するため、LINE とお客様情報の連携をお願いします。",
      "",
      "▼ すでに当店をご利用の方",
      "スタッフからお伝えする「連携コード」をこのトークンにそのまま送信してください。",
    ];
    if (intakeUrl) {
      lines.push("", "▼ はじめての方", "こちらの登録フォームからお願いします:", intakeUrl);
    }
    const body = lines.join("\n");

    await sendMessage(config.channelAccessToken, lineUserId, [{ type: "text", text: body }]);

    // 送信した案内も履歴に残す (クールダウン判定にも使う)。
    await recordOutboundLineMessage({
      tenantId,
      lineUserId,
      body,
      delivered: true,
    });
  } catch (e) {
    logger.warn("[linkPrompt] maybePromptLineLink threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
