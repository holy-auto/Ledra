/**
 * 停滞した見積り会話フローの再促し (inbound_message.auto_flow_nudge)。
 *
 * お見積りの詳細 (車検証写真 or 車種+年式) を依頼したまま一定時間ご返信が無い会話
 * (state=awaiting_quote_detail) へ、失効 (72h) する前に 1 回だけ「その後いかがでしょうか」の
 * 再促しを LINE で送り、放置された見積りリードの取りこぼしを減らす。
 *
 * 対象を awaiting_quote_detail に限る理由: 車検証/車種年式の再送だけで先へ進める“無状態”な
 * 再促しで、過去メッセージのボタン (日程/キャンセル候補) の陳腐化を気にせず送れるため。
 * 日程選択待ち等の再促しは、古い候補ボタンを作り直す必要があり別対応 (今回スコープ外)。
 *
 * 重複送信防止: 送信 (成功/失敗) のたびに notification_logs に type=flow_nudge /
 * target_id=フローID を残し、既にログのある会話はスキップする (1 会話につき 1 回だけ)。
 */
import type { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { sendCustomerLineText } from "@/lib/line/client";
import { buildQuoteDetailNudge } from "@/lib/line/flow/messages";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

/** 最後の活動からこの時間ご返信が無ければ再促し対象 (既定 24h)。 */
export const NUDGE_AFTER_HOURS = 24;

type FlowRow = {
  id: string;
  customer_id: string | null;
  line_user_id: string | null;
  updated_at: string | null;
  expires_at: string | null;
};

type CustomerRow = { id: string; followup_opt_out: boolean | null };

/**
 * 1 テナントぶんの停滞フロー再促しを送る。呼び出し側 (cron route) が opt-in・プラン・
 * 有効性を確認済みである前提。失敗しても投げない。
 * @param now 判定基準時刻 (省略時は現在)。テスト用に注入可能。
 * @returns 送信成功件数。
 */
export async function processStalledFlowNudges(
  admin: Admin,
  params: { tenantId: string; now?: Date },
): Promise<number> {
  const { tenantId } = params;
  const now = params.now ?? new Date();
  try {
    const nowIso = now.toISOString();
    const cutoffIso = new Date(now.getTime() - NUDGE_AFTER_HOURS * 3600_000).toISOString();

    // 見積り詳細待ちのまま停滞 (updated_at が cutoff より古い) かつ未失効 (expires_at 未来) の会話。
    const { data: flowData, error: flowErr } = await admin
      .from("line_conversation_flows")
      .select("id, customer_id, line_user_id, updated_at, expires_at")
      .eq("tenant_id", tenantId)
      .eq("state", "awaiting_quote_detail")
      .lt("updated_at", cutoffIso)
      .gt("expires_at", nowIso);
    if (flowErr) {
      logger.warn("[flowNudges] flow select failed", { tenantId, err: flowErr.message });
      return 0;
    }
    // push には line_user_id 必須。.lt/.gt が効かない環境でも取りこぼさないようコード側でも再判定する。
    const flows = ((flowData as FlowRow[] | null) ?? []).filter(
      (f) =>
        !!f.line_user_id &&
        (f.updated_at == null || f.updated_at < cutoffIso) &&
        (f.expires_at == null || f.expires_at > nowIso),
    );
    if (flows.length === 0) return 0;

    // 既に再促し済みの会話は除外する (1 会話 1 回)。
    const flowIds = flows.map((f) => f.id);
    const { data: logRows } = await admin
      .from("notification_logs")
      .select("target_id")
      .eq("tenant_id", tenantId)
      .eq("type", "flow_nudge")
      .in("target_id", flowIds);
    const alreadyNudged = new Set(((logRows as Array<{ target_id: string }> | null) ?? []).map((l) => l.target_id));

    const pending = flows.filter((f) => !alreadyNudged.has(f.id));
    if (pending.length === 0) return 0;

    // フォローアップ拒否のお客様を除外 (顧客紐付け済みのときのみ判定。未紐付けは能動リード扱いで送る)。
    const customerIds = [...new Set(pending.map((f) => f.customer_id).filter(Boolean))] as string[];
    const optedOut = new Set<string>();
    if (customerIds.length > 0) {
      const { data: customers } = await admin
        .from("customers")
        .select("id, followup_opt_out")
        .eq("tenant_id", tenantId)
        .in("id", customerIds);
      for (const c of (customers as CustomerRow[] | null) ?? []) {
        if (c.followup_opt_out) optedOut.add(c.id);
      }
    }

    let sent = 0;
    for (const f of pending) {
      if (f.customer_id && optedOut.has(f.customer_id)) continue;
      const lineUserId = f.line_user_id as string;

      const ok = await sendCustomerLineText({
        tenantId,
        customerId: f.customer_id,
        lineUserId,
        body: buildQuoteDetailNudge(),
      });

      // 結果に関わらずログを残して再送ループ/二重送信を防ぐ (失敗は logs で可視化)。
      await admin.from("notification_logs").insert({
        tenant_id: tenantId,
        type: "flow_nudge",
        target_type: "conversation_flow",
        target_id: f.id,
        recipient_line_user_id: lineUserId,
        channel: "line",
        status: ok ? "sent" : "failed",
      });

      if (ok) sent++;
    }
    return sent;
  } catch (e) {
    logger.warn("[flowNudges] processStalledFlowNudges threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return 0;
  }
}
