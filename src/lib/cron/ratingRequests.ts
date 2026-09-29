/**
 * IMP-029 `rating_request`: 証明書発行の数日後に、施工店の顧客へ評価（星 + 任意コメント）を依頼する
 * （DECISION_LOG 2026-09-27。受領サイン直後の signature_reviews とは別物）。
 *
 * - 発行時: `queueRatingRequest()`（triggerCertificateIssued から）が certificate_rating_requests に
 *   send_after = 発行 + RATING_REQUEST_DELAY_DAYS 日 で1行作る。certificate_id UNIQUE で1証明書1回。
 * - 送信: `processRatingRequests()`（cron/follow-up から1日1回）が send_after を過ぎた未送信行を
 *   `sent_at IS NULL` 条件付き UPDATE で取り、取れた行だけ dispatchNotification で送る（二重送信防止）。
 * - 回答: 顧客は /rate/[token] から送る（api/rating/[token]）。
 *
 * 送信対象は follow_up_settings.enabled のテナントだけ（呼び出し側が shopNames で渡す）。
 * 顧客向けフォローの既存スイッチをそのまま使い、テナントが止められるようにする。
 * followup_opt_out の顧客・発行取消（void）の証明書には送らない。
 */
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * 発行から評価依頼までの日数。
 * ponytail: 全テナント共通の固定値（施工直後の状態が落ち着き、記憶が新しいうちの一般的な範囲）。
 * テナント設定可能にする余地あり — そのときは follow_up_settings に列を足してここで読む。
 */
export const RATING_REQUEST_DELAY_DAYS = 7;

/** send_after がこれより古い未送信行は送らない（cron 停止明けに古い依頼をまとめて送らないため）。 */
export const RATING_REQUEST_STALE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function ratingRequestSendAfter(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + RATING_REQUEST_DELAY_DAYS * DAY_MS);
}

/** 発行時に評価依頼を予約する。既に予約済み（UNIQUE 違反）なら何もしない。 */
export async function queueRatingRequest(
  admin: SupabaseClient,
  p: { tenantId: string; certificateId: string; customerId: string; issuedAt?: Date },
): Promise<void> {
  const { error } = await admin.from("certificate_rating_requests").insert({
    tenant_id: p.tenantId,
    certificate_id: p.certificateId,
    customer_id: p.customerId,
    token: randomUUID(),
    send_after: ratingRequestSendAfter(p.issuedAt ?? new Date()).toISOString(),
  });
  if (error && (error as { code?: string }).code !== "23505") {
    throw new Error(`certificate_rating_requests insert: ${error.message}`);
  }
}

type PendingRow = { id: string; tenant_id: string; certificate_id: string; customer_id: string | null; token: string };

/**
 * send_after を過ぎた未送信の評価依頼を送る。送った件数を返す。
 * @param shopNames 送信対象テナント（follow_up_settings.enabled）→ 店名
 */
export async function processRatingRequests(
  supabase: SupabaseClient,
  now: Date,
  shopNames: ReadonlyMap<string, string>,
): Promise<number> {
  const tenantIds = [...shopNames.keys()];
  if (!tenantIds.length) return 0;

  const { data: rows, error } = await supabase
    .from("certificate_rating_requests")
    .select("id, tenant_id, certificate_id, customer_id, token")
    .in("tenant_id", tenantIds)
    .is("sent_at", null)
    .lte("send_after", now.toISOString())
    .gt("send_after", new Date(now.getTime() - RATING_REQUEST_STALE_DAYS * DAY_MS).toISOString())
    .limit(500);
  if (error) throw new Error(`certificate_rating_requests select: ${error.message}`);
  const pending = ((rows ?? []) as PendingRow[]).filter((r) => r.customer_id && shopNames.has(r.tenant_id));
  if (!pending.length) return 0;

  const [{ data: certs }, { data: customers }] = await Promise.all([
    supabase
      .from("certificates")
      .select("id, status")
      .in(
        "id",
        pending.map((r) => r.certificate_id),
      ),
    supabase
      .from("customers")
      .select("id, name, followup_opt_out")
      .in(
        "id",
        pending.map((r) => r.customer_id as string),
      ),
  ]);
  const activeCertIds = new Set(
    ((certs ?? []) as { id: string; status: string }[]).filter((c) => c.status === "active").map((c) => c.id),
  );
  const customerMap = new Map(
    ((customers ?? []) as { id: string; name: string | null; followup_opt_out: boolean | null }[]).map((c) => [
      c.id,
      c,
    ]),
  );

  let sent = 0;
  for (const row of pending) {
    const customer = customerMap.get(row.customer_id as string);
    if (!activeCertIds.has(row.certificate_id) || !customer || customer.followup_opt_out) continue;

    // 取れた行だけ送る（並行実行・再実行でも1回）。送信失敗は dispatch が warn に留めるので再送しない。
    const { data: claimed } = await supabase
      .from("certificate_rating_requests")
      .update({ sent_at: now.toISOString() })
      .eq("id", row.id)
      .is("sent_at", null)
      .select("id");
    if (!claimed?.length) continue;

    const shopName = shopNames.get(row.tenant_id) ?? "施工店";
    await dispatchNotification({
      tenantId: row.tenant_id,
      type: "rating_request",
      title: `【${shopName}】施工のご感想をお聞かせください`,
      body: `${customer.name ? `${customer.name} 様\n` : ""}先日は${shopName}をご利用いただきありがとうございました。施工後の状態や対応について、よろしければ下記リンクから評価をお寄せください（1分ほどで終わります）。`,
      linkPath: `/rate/${row.token}`,
      customerId: row.customer_id,
    });
    sent++;
  }
  return sent;
}
