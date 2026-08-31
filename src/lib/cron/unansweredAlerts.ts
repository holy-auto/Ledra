/**
 * LINE 未返信スレッドの対応漏れ通知 (inbound_message.auto_unanswered_alert)。
 *
 * お客様からの LINE メッセージが一定時間返信されないまま放置されている
 * (スレッドの最新メッセージが inbound で、既定8時間以上経過) スレッドを見つけ、
 * 管理画面の通知でスタッフに知らせる。特定担当が受信箱を見ないと止まる状況を防ぐ。
 *
 * 自動返信・スタッフ返信済み (最新が店舗発=outbound) のスレッドは対象外
 * (返信すると最新が outbound になるため自然に外れる)。
 *
 * 重複防止: 通知のたびに notification_logs に type=unanswered_alert /
 * target_id=未返信メッセージID を残し、同じメッセージには二度通知しない。
 * お客様が新しく送れば新しいメッセージID になり、改めて通知される。
 */
import type { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { notifyStaffOfAiAction } from "@/lib/ai/automation/policy";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

/** この分数以上返信が無ければ対象 (既定8時間)。当日中の対応猶予を見込んで長めに取る。 */
export const UNANSWERED_MIN_MINUTES = 8 * 60;
/** これより古いスレッドは走査しない (再スキャンの上限。日数)。 */
export const UNANSWERED_MAX_HOURS = 72;
/** 1 実行・1 テナントで出す通知の上限 (フラッド防止。溢れは次回に回る)。 */
const MAX_ALERTS_PER_RUN = 20;
/** メッセージ走査のページング上限 (1 ページ 1000 件)。実質 = 走査するメッセージ数の天井。 */
const MAX_SCAN_PAGES = 20;

type MessageRow = {
  id: string;
  customer_id: string | null;
  line_user_id: string | null;
  direction: string;
  created_at: string;
};

// line_user_id は顧客リンクの前後で不変なので優先キーにする (customer_id はリンク時に
// バックフィルされるが、遅延/失敗すると同一会話が2スレッドに割れて誤アラートを生むため)。
function threadKey(m: MessageRow): string | null {
  if (m.line_user_id) return `u:${m.line_user_id}`;
  return m.customer_id ? `c:${m.customer_id}` : null;
}

/**
 * 1 テナントぶんの未返信スレッド通知を出す。呼び出し側 (cron route) が opt-in・プラン・
 * 有効性を確認済みである前提。失敗しても投げない。
 * @param now 判定基準時刻 (省略時は現在)。テスト用に注入可能。
 * @returns 出した通知の件数。
 */
export async function processUnansweredThreadAlerts(
  admin: Admin,
  params: { tenantId: string; now?: Date },
): Promise<number> {
  const { tenantId } = params;
  const now = params.now ?? new Date();
  try {
    const minAgeMs = now.getTime() - UNANSWERED_MIN_MINUTES * 60_000;
    const maxAgeIso = new Date(now.getTime() - UNANSWERED_MAX_HOURS * 3600_000).toISOString();

    // 対象窓内の LINE メッセージを新しい順に、created_at のキーセットで全ページ取得する。
    // 単純な .limit(1000) だと、メッセージ量の多いテナントでスレッドの最新が 1000 件の外に
    // こぼれて未返信を取りこぼす (対応漏れ防止の主目的が静かに壊れる) ため、ページングする。
    const PAGE = 1000;
    const seen = new Set<string>();
    const rows: MessageRow[] = [];
    let cursor = now.toISOString();
    // ponytail: 走査は「直近 UNANSWERED_MAX_HOURS 以内 × 最大 MAX_SCAN_PAGES ページ」で頭打ち。
    // これを超える超大量スレッドのテナントは古い側を取りこぼしうる。上限に達するようなら、
    // 「未返信候補(inbound を時刻窓で絞る)＋各スレッドの新着有無を個別確認」方式へ上げる。
    for (let page = 0; page < MAX_SCAN_PAGES; page++) {
      const { data, error } = await admin
        .from("customer_messages")
        .select("id, customer_id, line_user_id, direction, created_at")
        .eq("tenant_id", tenantId)
        .eq("channel", "line")
        .gte("created_at", maxAgeIso)
        .lte("created_at", cursor)
        .order("created_at", { ascending: false })
        .limit(PAGE);
      if (error) {
        logger.warn("[unansweredAlerts] message select failed", { tenantId, err: error.message });
        return 0;
      }
      const batch = (data as MessageRow[] | null) ?? [];
      // 境界 (cursor と同時刻) の行はページ跨ぎで再取得されるため id で重複排除する。
      const fresh = batch.filter((m) => !seen.has(m.id));
      for (const m of fresh) {
        seen.add(m.id);
        rows.push(m);
      }
      if (batch.length < PAGE) break;
      cursor = batch[batch.length - 1].created_at; // このページの最古を次ページの上限に。
    }
    // 取得順に依存せず最新を確定するため降順に整える (テストの偽ストア等、順序保証の無いソース対策)。
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // 新しい順なので、スレッドごとに最初に出会った行が「最新メッセージ」。
    const latestByThread = new Map<string, MessageRow>();
    for (const m of rows) {
      const key = threadKey(m);
      if (!key || latestByThread.has(key)) continue;
      latestByThread.set(key, m);
    }
    // 未返信 = 最新が inbound かつ既定分数以上経過。
    const candidates = [...latestByThread.values()].filter(
      (m) => m.direction === "inbound" && new Date(m.created_at).getTime() < minAgeMs,
    );
    if (candidates.length === 0) return 0;

    // 既に通知済み (同じ未返信メッセージ) は除外。
    const ids = candidates.map((c) => c.id);
    const { data: logRows } = await admin
      .from("notification_logs")
      .select("target_id")
      .eq("tenant_id", tenantId)
      .eq("type", "unanswered_alert")
      .in("target_id", ids);
    const alreadyAlerted = new Set(((logRows as Array<{ target_id: string }> | null) ?? []).map((l) => l.target_id));

    // 古い未返信から順に、上限まで。
    const pending = candidates
      .filter((c) => !alreadyAlerted.has(c.id))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, MAX_ALERTS_PER_RUN);
    if (pending.length === 0) return 0;

    // 顧客名を一括解決 (通知本文を分かりやすくする)。
    const customerIds = [...new Set(pending.map((c) => c.customer_id).filter(Boolean))] as string[];
    const nameById = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: customers } = await admin
        .from("customers")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .in("id", customerIds);
      for (const c of (customers as Array<{ id: string; name: string | null }> | null) ?? []) {
        if (c.name?.trim()) nameById.set(c.id, c.name.trim());
      }
    }

    let sent = 0;
    for (const c of pending) {
      const who = (c.customer_id && nameById.get(c.customer_id)) || "未登録のお客様";
      const mins = Math.floor((now.getTime() - new Date(c.created_at).getTime()) / 60_000);
      const notified = await notifyStaffOfAiAction(
        admin,
        tenantId,
        "LINEの未返信メッセージがあります",
        `${who}からのLINEメッセージが約${mins}分未返信です。受信箱からご対応をお願いします。`,
      );
      // 通知が作れなかったら dedup ログを残さない → 次回改めて通知を試みる (SLA アラートを取りこぼさない)。
      if (!notified) continue;
      const { error: logErr } = await admin.from("notification_logs").insert({
        tenant_id: tenantId,
        type: "unanswered_alert",
        target_type: "customer_message",
        target_id: c.id,
        recipient_line_user_id: c.line_user_id,
        channel: "line",
        status: "sent",
      });
      // ログ insert が失敗すると次回に重複通知になり得るため握りつぶさず可視化する。
      if (logErr) {
        logger.warn("[unansweredAlerts] dedup log insert failed (risk of re-alert next run)", {
          tenantId,
          messageId: c.id,
          err: logErr.message,
        });
      }
      sent++;
    }
    return sent;
  } catch (e) {
    logger.warn("[unansweredAlerts] processUnansweredThreadAlerts threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return 0;
  }
}
