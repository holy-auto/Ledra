/**
 * LINE 受信メッセージのスタッフ向け通知 (in-app notifications)。
 *
 * customer からの inbound メッセージ受信時に、テナント全員宛 (user_id=NULL) の
 * `chat_message` 通知を作り、サイドバーのベル (NotificationBell) に出す。
 * メール等ではなくアプリ内通知を使う: 通知疲れが少なく、既読/Realtime も既存対応済み。
 *
 * 通知疲れ対策: 同一テナントで直近 COOLDOWN_MIN 分に chat_message 通知を作っていれば
 * スキップする (1 件ごとに通知しない / 受信箱の未読バッジで件数は別途分かる)。
 *
 * webhook から fire-and-forget で呼ばれる。絶対に throw しない。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/** 同一テナントへの chat_message 通知を抑制する間隔 (分)。 */
const COOLDOWN_MIN = 30;

export interface MaybeNotifyInboundParams {
  tenantId: string;
  /** 送信元 LINE userId (顧客名解決に使う)。 */
  lineUserId: string;
  /** 解決済みの customer_id (あれば link を顧客スレッドに向ける)。 */
  customerId?: string | null;
}

function isMissingRelationError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (["42P01", "PGRST205", "42703", "PGRST204"].includes(err.code ?? "")) return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * inbound 受信時にスタッフ向け in-app 通知を作る。クールダウン内ならスキップ。
 * 失敗しても webhook を止めない (常に resolve)。
 */
export async function maybeNotifyInboundMessage(params: MaybeNotifyInboundParams): Promise<void> {
  const { tenantId, lineUserId, customerId } = params;
  try {
    const admin = createServiceRoleAdmin("LINE inbound staff notification — webhook lacks auth session");

    // クールダウン: 直近 COOLDOWN_MIN 分に chat_message 通知があればスキップ。
    const sinceIso = new Date(Date.now() - COOLDOWN_MIN * 60_000).toISOString();
    const { count, error: countErr } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("notification_type", "chat_message")
      .gte("created_at", sinceIso);
    if (countErr) {
      // テーブルが無い等は黙ってスキップ (通知は best-effort)。
      if (!isMissingRelationError(countErr)) {
        logger.warn("[lineNotify] cooldown check failed", { tenantId, err: countErr.message });
      }
      return;
    }
    if ((count ?? 0) > 0) return; // クールダウン中

    // 顧客名 (分かれば本文に出す。無ければ汎用文)。本文に LINE メッセージ内容は載せない。
    let who = "顧客";
    if (customerId) {
      const { data: c } = await admin
        .from("customers")
        .select("name")
        .eq("id", customerId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (c?.name) who = `${c.name} 様`;
    }

    // link 先: 顧客スレッドが分かればそれ、無ければ受信箱トップ。
    const linkPath = customerId ? `/admin/messages?thread=c:${customerId}` : "/admin/messages";

    const { error: insErr } = await admin.from("notifications").insert({
      tenant_id: tenantId,
      user_id: null, // テナント全員宛
      notification_type: "chat_message",
      priority: "normal",
      title: "LINE に新着メッセージ",
      body: `${who} からメッセージが届いています。`,
      link_path: linkPath,
    });
    if (insErr && !isMissingRelationError(insErr)) {
      logger.warn("[lineNotify] notification insert failed", { tenantId, err: insErr.message });
    }
    // lineUserId はログ相関用 (本文には出さない)。
    logger.info("[lineNotify] inbound notification created", { tenantId, hasCustomer: !!customerId, lineUserId });
  } catch (e) {
    logger.warn("[lineNotify] maybeNotifyInboundMessage threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
