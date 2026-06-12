import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { sendNotificationBroadcast, type NotificationRecipient } from "@/lib/notifications/broadcast";
import { sendLineBroadcast, type BroadcastRecipient } from "@/lib/line/broadcast";
import { segmentSchema, type NotificationBroadcastSegment } from "@/lib/validations/notification-broadcast";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminClient = ReturnType<typeof createTenantScopedAdmin>["admin"];
type Channel = "sms" | "email" | "line" | "push";

/**
 * POST /api/admin/notification-broadcasts/[id]/send
 *
 * 配信を即時実行する (LINE / SMS / メール)。
 *  1. 配信を取得し、テナント所属 + status (draft / scheduled) を検証。
 *  2. status を 'sending' へ原子的に遷移 (二重送信ガード)。
 *  3. segment_json + channel から受信者を解決 (チャネル別に必要な宛先列で絞る)。
 *  4. チャネル別に送信:
 *       - line → sendLineBroadcast (既存)
 *       - sms / email → sendNotificationBroadcast
 *  5. 配信結果で status='sent' (または 1 件も送れず failed) に更新。
 *
 * 注意: customers.last_visit_date 列が無いため segment_type "no_visit_days" は
 *       当面 "all" 相当にフォールバックする (列追加後に有効化予定)。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return apiNotFound("broadcast id required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 1) 配信を取得 (テナントスコープ)。
    const { data: broadcast, error: fetchErr } = await admin
      .from("notification_broadcasts")
      .select("id, status, channel, subject, message_text, segment_json")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (fetchErr) return apiInternalError(fetchErr, "notification-broadcasts send fetch");
    if (!broadcast) return apiNotFound("配信が見つかりません。");

    if (broadcast.status !== "draft" && broadcast.status !== "scheduled") {
      return apiValidationError("下書き・予約済みの配信のみ送信できます。");
    }

    const channel = broadcast.channel as Channel;
    if (channel === "push") {
      return apiValidationError("プッシュ配信は現在サポートしていません。");
    }

    // segment_json を検証 (不正なら all にフォールバック)。
    const segParsed = segmentSchema.safeParse(broadcast.segment_json);
    const segment: NotificationBroadcastSegment = segParsed.success ? segParsed.data : { segment_type: "all" };

    // 2) status を 'sending' へ原子的に遷移する (二重送信ガード)。
    const { data: claimed, error: claimErr } = await admin
      .from("notification_broadcasts")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .in("status", ["draft", "scheduled"])
      .select("id")
      .maybeSingle();
    if (claimErr) return apiInternalError(claimErr, "notification-broadcasts send claim");
    if (!claimed) {
      // 別リクエストが先に sending へ遷移させた等 (409 相当)。
      return apiValidationError("この配信は既に処理中または送信済みです。");
    }

    // 失敗時に status を draft へ戻す共通処理。
    const revertToDraft = async () => {
      await admin
        .from("notification_broadcasts")
        .update({ status: "draft", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", caller.tenantId);
    };

    // 3) 受信者を解決する。失敗時は status を draft に戻して再試行可能にする。
    let resolved: { recipients: NotificationRecipient[]; lineRecipients: BroadcastRecipient[] };
    try {
      resolved = await resolveRecipients(admin, caller.tenantId, channel, segment);
    } catch (e) {
      await revertToDraft();
      return apiInternalError(e, "notification-broadcasts send resolveRecipients");
    }

    // 4) チャネル別に送信する。
    let targetCount: number;
    let sentCount: number;
    let failedCount: number;
    let notConfigured: boolean;

    if (channel === "line") {
      const result = await sendLineBroadcast({
        tenantId: caller.tenantId,
        body: broadcast.message_text as string,
        recipients: resolved.lineRecipients,
        sentByUserId: caller.userId,
      });
      targetCount = result.targetCount;
      sentCount = result.sentCount;
      failedCount = result.failedCount;
      notConfigured = result.notConfigured;
    } else {
      const result = await sendNotificationBroadcast({
        tenantId: caller.tenantId,
        channel,
        subject: (broadcast.subject as string | null) ?? null,
        body: broadcast.message_text as string,
        recipients: resolved.recipients,
        sentByUserId: caller.userId,
      });
      targetCount = result.targetCount;
      sentCount = result.sentCount;
      failedCount = result.failedCount;
      notConfigured = result.notConfigured;
    }

    // チャネル未設定なら status を draft に戻し、設定を促す。
    if (notConfigured) {
      await revertToDraft();
      const label = channel === "line" ? "LINE 連携" : channel === "sms" ? "SMS (Twilio)" : "メール送信";
      return apiValidationError(`このテナントは ${label} が未設定です。設定後に再度お試しください。`);
    }

    // 5) 配信結果を反映する。対象が居て全て失敗なら failed、それ以外は sent。
    const finalStatus = targetCount > 0 && sentCount === 0 ? "failed" : "sent";
    const { error: updateErr } = await admin
      .from("notification_broadcasts")
      .update({
        status: finalStatus,
        sent_at: new Date().toISOString(),
        target_count: targetCount,
        sent_count: sentCount,
        failed_count: failedCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);
    if (updateErr) return apiInternalError(updateErr, "notification-broadcasts send finalize");

    return apiJson({
      ok: true,
      sent_count: sentCount,
      failed_count: failedCount,
      target_count: targetCount,
    });
  } catch (e) {
    return apiInternalError(e, "notification-broadcasts send");
  }
}

/**
 * segment_json + channel に従って受信者を解決する。
 *
 * セグメント:
 *  - all          : 当該チャネルの宛先を持つ全顧客
 *  - no_visit_days : customers.last_visit_date 列が無いため all と同等にフォールバック
 *  - vehicle_type  : 指定メーカーの車両を持つ顧客に絞る (vehicles を join)
 *
 * チャネル別の宛先必須列:
 *  - sms   : phone IS NOT NULL
 *  - email : email IS NOT NULL
 *  - line  : line_user_id IS NOT NULL
 */
async function resolveRecipients(
  admin: AdminClient,
  tenantId: string,
  channel: Channel,
  segment: NotificationBroadcastSegment,
): Promise<{ recipients: NotificationRecipient[]; lineRecipients: BroadcastRecipient[] }> {
  // vehicle_type: 指定メーカーの車両を持つ顧客 customer_id を先に集める。
  let customerIdFilter: string[] | null = null;
  if (segment.segment_type === "vehicle_type") {
    const { data: vehicles, error } = await admin
      .from("vehicles")
      .select("customer_id")
      .eq("tenant_id", tenantId)
      .ilike("maker", segment.filters.maker)
      .not("customer_id", "is", null);
    if (error) throw error;
    const ids = [...new Set((vehicles ?? []).map((v) => v.customer_id).filter(Boolean))] as string[];
    if (ids.length === 0) return { recipients: [], lineRecipients: [] };
    customerIdFilter = ids;
  }

  // チャネルに応じて宛先列を絞る。
  const destColumn = channel === "sms" ? "phone" : channel === "email" ? "email" : "line_user_id";

  let query = admin
    .from("customers")
    .select("id, phone, email, line_user_id")
    .eq("tenant_id", tenantId)
    .not(destColumn, "is", null);

  if (customerIdFilter) {
    query = query.in("id", customerIdFilter);
  }

  const { data: customers, error } = await query;
  if (error) throw error;

  const recipients: NotificationRecipient[] = [];
  const lineRecipients: BroadcastRecipient[] = [];
  // 宛先の重複を排除 (1 宛先に 1 通)。
  const seen = new Set<string>();

  for (const c of customers ?? []) {
    const customerId = c.id as string;
    if (channel === "line") {
      const lineUserId = c.line_user_id as string | null;
      if (!lineUserId || seen.has(lineUserId)) continue;
      seen.add(lineUserId);
      lineRecipients.push({ lineUserId, customerId });
    } else if (channel === "sms") {
      const phone = c.phone as string | null;
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      recipients.push({ customerId, phone });
    } else if (channel === "email") {
      const email = c.email as string | null;
      if (!email || seen.has(email.toLowerCase())) continue;
      seen.add(email.toLowerCase());
      recipients.push({ customerId, email });
    }
  }

  return { recipients, lineRecipients };
}
